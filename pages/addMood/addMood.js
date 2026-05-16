const {
  getMoodCheckins,
  getPartnerNickname,
  getProfile,
  saveMoodCheckins
} = require("../../utils/storage");
const { saveCloudMoodCheckin, syncCloudMoodCheckins } = require("../../utils/cloudData");

const moodOptions = [
  {
    value: "happy",
    emoji: "😊",
    label: "开心",
    title: "安排一点庆祝",
    desc: "适合吃喜欢的、兑换小奖励，或者顺手完成一个轻松心愿。",
    actions: ["喜欢的菜单", "小奖券", "拍张照片"]
  },
  {
    value: "tired",
    emoji: "😴",
    label: "有点累",
    title: "少做决定",
    desc: "适合热乎的饭、抱抱券、安静陪伴，不要塞太多选择题。",
    actions: ["热汤面", "抱抱券", "不用做决定"]
  },
  {
    value: "comfort",
    emoji: "🥺",
    label: "想被哄",
    title: "先哄哄",
    desc: "适合一句认真夸夸、甜食、散步，先照顾心情再讨论事情。",
    actions: ["夸夸小票", "甜品", "散步"]
  },
  {
    value: "quiet",
    emoji: "🌙",
    label: "想安静",
    title: "轻轻陪着",
    desc: "适合不追问、不催促，做点低噪音的小事。",
    actions: ["一起看电影", "安静陪伴", "轻任务"]
  },
  {
    value: "sweet",
    emoji: "🍰",
    label: "想吃甜的",
    title: "来点甜",
    desc: "适合奶茶、蛋糕、水果，或者兑换一张小惊喜券。",
    actions: ["甜品菜单", "奶茶", "惊喜券"]
  },
  {
    value: "stress",
    emoji: "☁️",
    label: "压力大",
    title: "把生活变轻",
    desc: "适合分担一个任务，再留一点恢复时间。",
    actions: ["分担小任务", "热饮", "早点休息"]
  }
];

function todayKey() {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function getRoleText() {
  const profile = getProfile();
  return profile && profile.nickname ? profile.nickname : "我";
}

function getMoodMeta(value) {
  return moodOptions.find((item) => item.value === value) || moodOptions[0];
}

Page({
  data: {
    moodOptions,
    selectedMood: "happy",
    note: "",
    recommendation: moodOptions[0],
    partnerName: "对方"
  },

  onShow() {
    this.loadTodayMood();
  },

  async loadTodayMood() {
    if (getProfile() && getProfile().coupleCode) {
      try {
        await syncCloudMoodCheckins();
      } catch (error) {
        // 签到页可以继续使用本地缓存。
      }
    }

    const date = todayKey();
    const role = getRoleText();
    const ownCheckin = getMoodCheckins().find((item) => item.date === date && item.role === role);
    const selectedMood = ownCheckin ? ownCheckin.mood : this.data.selectedMood;

    this.setData({
      selectedMood,
      note: ownCheckin ? ownCheckin.note : this.data.note,
      recommendation: getMoodMeta(selectedMood),
      partnerName: getPartnerNickname()
    });
  },

  selectMood(event) {
    const selectedMood = event.currentTarget.dataset.value;

    this.setData({
      selectedMood,
      recommendation: getMoodMeta(selectedMood)
    });
  },

  handleNoteInput(event) {
    this.setData({
      note: event.detail.value
    });
  },

  async saveMood() {
    const date = todayKey();
    const role = getRoleText();
    const now = Date.now();
    const current = getMoodCheckins().find((item) => item.date === date && item.role === role);
    const nextCheckin = {
      id: `mood_${date}_${role}`,
      date,
      role,
      mood: this.data.selectedMood,
      note: this.data.note.trim(),
      createdAt: current && current.createdAt ? current.createdAt : now,
      updatedAt: now
    };
    const nextCheckins = getMoodCheckins()
      .filter((item) => !(item.date === date && item.role === role))
      .concat(nextCheckin);

    saveMoodCheckins(nextCheckins);

    if (getProfile() && getProfile().coupleCode) {
      try {
        await saveCloudMoodCheckin(nextCheckin);
      } catch (error) {
        wx.showToast({
          title: "本地已保存，云端稍后同步",
          icon: "none"
        });
      }
    }

    wx.showToast({
      title: "今日心情已保存",
      icon: "success"
    });

    setTimeout(() => {
      if (getCurrentPages().length > 1) {
        wx.navigateBack();
        return;
      }

      wx.navigateTo({
        url: "/pages/mood/mood"
      });
    }, 500);
  }
});
