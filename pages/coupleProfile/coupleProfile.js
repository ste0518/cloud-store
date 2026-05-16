const {
  getPartnerNickname,
  getProfile,
  getCoupleProfiles,
  saveCoupleProfiles
} = require("../../utils/storage");
const { saveCloudCoupleProfiles, syncCloudCoupleProfiles } = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");

const emptyProfile = {
  name: "",
  likes: "",
  dislikes: "",
  drinks: "",
  surprises: "",
  comfort: "",
  avoid: "",
  dateIdeas: ""
};

function normalizeProfiles(value) {
  return {
    me: {
      ...emptyProfile,
      ...(value && value.me ? value.me : {})
    },
    partner: {
      ...emptyProfile,
      ...(value && value.partner ? value.partner : {})
    }
  };
}

function fallbackText(value) {
  return value && value.trim() ? value.trim() : "还没填写";
}

Page({
  data: {
    activeRole: "partner",
    activeRoleText: "对方档案",
    partnerProfileText: "对方档案",
    profiles: normalizeProfiles(),
    currentProfile: { ...emptyProfile },
    summaryCards: [],
    isEditing: false
  },

  onShow() {
    this.loadProfiles();
    startPolling(this, this.loadProfiles);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadProfiles(nextRole, options = {}) {
    if (nextRole && nextRole.silent) {
      options = nextRole;
      nextRole = "";
    }

    const silent = Boolean(options.silent);

    if (getProfile() && getProfile().coupleCode) {
      try {
        await syncCloudCoupleProfiles();
      } catch (error) {
        if (!silent) {
          wx.showToast({
            title: "云档案同步失败，先显示本地档案",
            icon: "none"
          });
        }
      }
    }

    const profiles = normalizeProfiles(getCoupleProfiles());
    const activeRole = nextRole || this.data.activeRole;
    const partnerName = getPartnerNickname();
    const partnerProfileText = `${partnerName}档案`;
    const shouldKeepEditing = silent && this.data.isEditing;
    const currentProfile = shouldKeepEditing
      ? this.data.currentProfile
      : {
          ...profiles[activeRole]
        };

    this.setData({
      profiles,
      activeRole,
      activeRoleText: activeRole === "me" ? "我的档案" : partnerProfileText,
      partnerProfileText,
      currentProfile,
      summaryCards: this.buildSummaryCards(currentProfile)
    });
  },

  buildSummaryCards(profile) {
    return [
      { icon: "🍜", title: "喜欢吃", text: fallbackText(profile.likes) },
      { icon: "🚫", title: "不喜欢", text: fallbackText(profile.dislikes) },
      { icon: "🧋", title: "饮料偏好", text: fallbackText(profile.drinks) },
      { icon: "🎁", title: "小惊喜", text: fallbackText(profile.surprises) },
      { icon: "🤍", title: "安慰方式", text: fallbackText(profile.comfort) },
      { icon: "🌷", title: "约会偏好", text: fallbackText(profile.dateIdeas) }
    ];
  },

  switchRole(event) {
    this.setData({
      isEditing: false
    });
    this.loadProfiles(event.currentTarget.dataset.role);
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset;

    this.setData({
      [`currentProfile.${field}`]: event.detail.value,
      isEditing: true
    });
  },

  async saveProfileCard() {
    const { activeRole, currentProfile } = this.data;
    const profiles = normalizeProfiles(getCoupleProfiles());
    const nextProfiles = {
      ...profiles,
      [activeRole]: {
        ...emptyProfile,
        ...currentProfile,
        updatedAt: Date.now()
      }
    };

    saveCoupleProfiles(nextProfiles);

    if (getProfile() && getProfile().coupleCode) {
      try {
        await saveCloudCoupleProfiles(nextProfiles);
      } catch (error) {
        wx.showToast({
          title: "本地已保存，云端稍后同步",
          icon: "none"
        });
      }
    }

    this.setData({
      isEditing: false
    });
    this.loadProfiles(activeRole);

    wx.showToast({
      title: "档案保存啦",
      icon: "success"
    });
  }
});
