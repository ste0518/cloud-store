const { getBlindVotes, getPartnerNickname, getProfile, saveBlindVotes } = require("../../utils/storage");
const { deleteCloudBlindVote, saveCloudBlindVote, syncCloudBlindVotes } = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");

const defaultForm = {
  title: "",
  options: ""
};

const defaultChoiceForm = {
  customOption: ""
};

function parseOptions(value) {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getLatestVote(votes) {
  if (!votes.length) {
    return null;
  }

  return votes.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
}

function normalizeVote(vote) {
  if (!vote) {
    return null;
  }

  return {
    ...vote,
    options: Array.isArray(vote.options) ? vote.options : [],
    votes: {
      personA: null,
      personB: null,
      ...(vote.votes || {})
    }
  };
}

function getRoleName(role) {
  const profile = getProfile();

  if (role === "personA") {
    return profile && profile.nickname ? profile.nickname : "我";
  }

  return getPartnerNickname();
}

Page({
  data: {
    currentVote: null,
    selectedRole: "",
    form: { ...defaultForm },
    choiceForm: { ...defaultChoiceForm },
    statusCards: [],
    finalMessage: "",
    isDeciding: false,
    selectedRoleHasVoted: false,
    partnerName: "对方"
  },

  onShow() {
    this.setData({
      partnerName: getPartnerNickname()
    });
    this.loadCurrentVote();
    startPolling(this, this.loadCurrentVote);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadCurrentVote(options = {}) {
    const silent = Boolean(options.silent);
    const profile = getProfile();

    if (profile && profile.coupleCode) {
      try {
        await syncCloudBlindVotes();
      } catch (error) {
        if (!silent) {
          wx.showToast({
            title: "云盲投同步失败，先显示本地记录",
            icon: "none"
          });
        }
      }
    }

    const currentVote = normalizeVote(getLatestVote(getBlindVotes()));

    this.setVoteData(currentVote);
  },

  setVoteData(vote) {
    const statusCards = vote
      ? [
          {
            role: getRoleName("personA"),
            done: Boolean(vote.votes.personA)
          },
          {
            role: getRoleName("personB"),
            done: Boolean(vote.votes.personB)
          }
        ]
      : [];
    const finalMessage = vote && vote.revealed
      ? vote.votes.personA === vote.votes.personB
        ? "默契成功"
        : "这次没有选到同一个，但也很可爱"
      : "";

    this.setData({
      currentVote: vote,
      statusCards,
      finalMessage,
      selectedRoleHasVoted: this.hasSelectedRoleVoted(vote, this.data.selectedRole)
    });
  },

  hasSelectedRoleVoted(vote, role) {
    return Boolean(vote && role && vote.votes[role]);
  },

  saveCurrentVote(nextVote) {
    const votes = getBlindVotes();
    const exists = votes.some((vote) => vote.id === nextVote.id);
    const nextVotes = exists
      ? votes.map((vote) => (vote.id === nextVote.id ? nextVote : vote))
      : votes.concat(nextVote);
    const profile = getProfile();

    saveBlindVotes(nextVotes);
    this.setVoteData(nextVote);

    if (profile && profile.coupleCode) {
      saveCloudBlindVote(nextVote)
        .then((cloudVote) => {
          if (!cloudVote) {
            return;
          }

          saveBlindVotes(getBlindVotes().map((vote) => (vote.id === cloudVote.id ? cloudVote : vote)));
          this.setVoteData(cloudVote);
        })
        .catch(() => {
          wx.showToast({
            title: "本地已保存，云端稍后同步",
            icon: "none"
          });
        });
    }
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset;

    this.setData({
      [`form.${field}`]: event.detail.value
    });
  },

  createVote() {
    const title = this.data.form.title.trim() || "今晚吃什么？";
    const options = parseOptions(this.data.form.options);
    const now = Date.now();

    const vote = {
      id: `blind_${now}`,
      title,
      options,
      votes: {
        personA: null,
        personB: null
      },
      revealed: false,
      result: null,
      createdAt: now
    };

    this.saveCurrentVote(vote);
    this.setData({
      selectedRole: "",
      form: { ...defaultForm },
      choiceForm: { ...defaultChoiceForm }
    });

    wx.showToast({
      title: "盲投准备好啦",
      icon: "success"
    });
  },

  selectRole(event) {
    const selectedRole = event.currentTarget.dataset.role;

    this.setData({
      selectedRole,
      choiceForm: { ...defaultChoiceForm },
      selectedRoleHasVoted: this.hasSelectedRoleVoted(this.data.currentVote, selectedRole)
    });
  },

  handleChoiceInput(event) {
    this.setData({
      "choiceForm.customOption": event.detail.value
    });
  },

  fillChoiceFromOption(event) {
    const { option } = event.currentTarget.dataset;

    this.setData({
      "choiceForm.customOption": option
    });
  },

  submitVote() {
    const { currentVote, selectedRole } = this.data;
    const option = this.data.choiceForm.customOption.trim();

    if (!currentVote || !selectedRole || currentVote.revealed) {
      return;
    }

    if (currentVote.votes[selectedRole]) {
      wx.showToast({
        title: `${getRoleName(selectedRole)} 已经投过啦`,
        icon: "none"
      });
      return;
    }

    if (!option) {
      wx.showToast({
        title: "写下你想吃什么吧",
        icon: "none"
      });
      return;
    }

    const nextVote = {
      ...currentVote,
      votes: {
        ...currentVote.votes,
        [selectedRole]: option
      }
    };

    if (nextVote.votes.personA && nextVote.votes.personB) {
      nextVote.revealed = true;
    }

    this.saveCurrentVote(nextVote);
    this.setData({
      choiceForm: { ...defaultChoiceForm }
    });

    wx.showToast({
      title: `${getRoleName(selectedRole)} 已悄悄投票`,
      icon: "success"
    });
  },

  decideWithWheel() {
    const { currentVote, isDeciding } = this.data;

    if (!currentVote || !currentVote.revealed || isDeciding) {
      return;
    }

    const choices = [currentVote.votes.personA, currentVote.votes.personB].filter(Boolean);

    if (choices.length < 2) {
      return;
    }

    this.setData({
      isDeciding: true
    });

    setTimeout(() => {
      const result = choices[Math.floor(Math.random() * choices.length)];
      const nextVote = {
        ...currentVote,
        result
      };

      this.saveCurrentVote(nextVote);
      this.setData({
        isDeciding: false
      });

      wx.showToast({
        title: "转盘决定好啦",
        icon: "success"
      });
    }, 600);
  },

  resetCurrentVote() {
    const { currentVote } = this.data;

    if (!currentVote) {
      return;
    }

    wx.showModal({
      title: "重置当前投票",
      content: "要清空当前盲投，重新开始一个新主题吗？",
      confirmText: "重置",
      confirmColor: "#FF9EBB",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        const nextVotes = getBlindVotes().filter((vote) => vote.id !== currentVote.id);

        saveBlindVotes(nextVotes);

        if (getProfile() && getProfile().coupleCode) {
          try {
            await deleteCloudBlindVote(currentVote.id);
          } catch (error) {
            wx.showToast({
              title: "本地已重置，云端稍后同步",
              icon: "none"
            });
          }
        }

        this.setData({
          currentVote: null,
          selectedRole: "",
          statusCards: [],
          finalMessage: "",
          isDeciding: false,
          selectedRoleHasVoted: false
        });

        wx.showToast({
          title: "已经重新开始啦",
          icon: "success"
        });
      }
    });
  }
});
