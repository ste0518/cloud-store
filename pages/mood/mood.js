const {
  getDisplayName,
  getMoodCheckins,
  getPartnerNickname,
  getProfile
} = require("../../utils/storage");
const { syncCloudMoodCheckins } = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");

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

function formatDate(value) {
  if (!value) {
    return "";
  }

  const parts = value.split("-");
  return `${parts[1]}.${parts[2]}`;
}

function getRoleText() {
  const profile = getProfile();
  return profile && profile.nickname ? profile.nickname : "我";
}

function formatPersonName(value) {
  return getDisplayName(value, "我");
}

function getMoodMeta(value) {
  return moodOptions.find((item) => item.value === value) || moodOptions[0];
}

Page({
  data: {
    todayDay: "",
    todayMonth: "",
    recommendation: null,
    todayCheckins: [],
    history: [],
    partnerName: "对方"
  },

  onShow() {
    this.loadMoodData();
    startPolling(this, this.loadMoodData);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadMoodData(options = {}) {
    const silent = Boolean(options.silent);
    const partnerName = getPartnerNickname();

    if (getProfile() && getProfile().coupleCode) {
      try {
        await syncCloudMoodCheckins();
      } catch (error) {
        if (!silent) {
          wx.showToast({
            title: "云心情同步失败，先显示本地记录",
            icon: "none"
          });
        }
      }
    }

    const now = new Date();
    const date = todayKey();
    const role = getRoleText();
    const checkins = getMoodCheckins();
    const ownCheckin = checkins.find((item) => item.date === date && item.role === role);
    const todayCheckins = checkins
      .filter((item) => item.date === date)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((item) => {
        const meta = getMoodMeta(item.mood);
        return {
          ...item,
          role: formatPersonName(item.role),
          emoji: meta.emoji,
          label: meta.label
        };
      });
    const history = checkins
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 12)
      .map((item) => {
        const meta = getMoodMeta(item.mood);
        return {
          ...item,
          role: formatPersonName(item.role),
          emoji: meta.emoji,
          label: meta.label,
          dateText: formatDate(item.date)
        };
      });

    this.setData({
      recommendation: ownCheckin ? getMoodMeta(ownCheckin.mood) : null,
      todayDay: `${now.getDate()}`.padStart(2, "0"),
      todayMonth: `${now.getMonth() + 1} 月`,
      partnerName,
      todayCheckins,
      history
    });
  },

  goAddMood() {
    wx.navigateTo({
      url: "/pages/addMood/addMood"
    });
  }
});
