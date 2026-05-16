const {
  getAnniversaries,
  getProfile,
  saveAnniversaries
} = require("../../utils/storage");
const { saveCloudAnniversary } = require("../../utils/cloudData");

const typeOptions = [
  { value: "love", label: "恋爱纪念", icon: "💗" },
  { value: "birthday", label: "生日", icon: "🎂" },
  { value: "date", label: "第一次约会", icon: "🌷" },
  { value: "trip", label: "旅行", icon: "🧳" },
  { value: "plan", label: "重要计划", icon: "⭐" }
];

function todayText() {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function defaultForm() {
  return {
    title: "",
    date: todayText(),
    typeIndex: 0,
    icon: "💗",
    remark: ""
  };
}

Page({
  data: {
    typeOptions,
    form: defaultForm()
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset;

    this.setData({
      [`form.${field}`]: event.detail.value
    });
  },

  handleDateChange(event) {
    this.setData({
      "form.date": event.detail.value
    });
  },

  handleTypeChange(event) {
    const typeIndex = Number(event.detail.value);

    this.setData({
      "form.typeIndex": typeIndex,
      "form.icon": typeOptions[typeIndex].icon
    });
  },

  async addAnniversary() {
    const { form } = this.data;
    const title = form.title.trim();

    if (!title) {
      wx.showToast({
        title: "先写纪念日名称吧",
        icon: "none"
      });
      return;
    }

    const type = typeOptions[form.typeIndex].value;
    const now = Date.now();
    const item = {
      id: `anniversary_${now}`,
      title,
      date: form.date,
      type,
      icon: form.icon.trim() || typeOptions[form.typeIndex].icon,
      remark: form.remark.trim(),
      createdAt: now
    };

    saveAnniversaries(getAnniversaries().concat(item));

    if (getProfile() && getProfile().coupleCode) {
      try {
        await saveCloudAnniversary(item);
      } catch (error) {
        wx.showToast({
          title: "本地已保存，云端稍后同步",
          icon: "none"
        });
      }
    }

    wx.showToast({
      title: "纪念日收好啦",
      icon: "success"
    });

    setTimeout(() => {
      if (getCurrentPages().length > 1) {
        wx.navigateBack();
        return;
      }

      wx.navigateTo({
        url: "/pages/anniversary/anniversary"
      });
    }, 500);
  }
});
