const {
  getLifeTasks,
  getPartnerNickname,
  getProfile,
  saveLifeTasks
} = require("../../utils/storage");
const { saveCloudLifeTask } = require("../../utils/cloudData");

const typeOptions = [
  { value: "home", label: "家务", icon: "🧹" },
  { value: "buy", label: "采购", icon: "🛒" },
  { value: "errand", label: "跑腿", icon: "📦" },
  { value: "together", label: "一起完成", icon: "🤝" },
  { value: "care", label: "照顾彼此", icon: "💗" }
];

function buildAssigneeOptions() {
  const partnerName = getPartnerNickname();

  return [
    { value: "一起", label: "一起" },
    { value: "我", label: "我" },
    { value: "对方", label: partnerName }
  ];
}

function todayText() {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function defaultForm() {
  return {
    title: "",
    typeIndex: 0,
    assigneeIndex: 0,
    dueDate: todayText(),
    reward: "3"
  };
}

Page({
  data: {
    typeOptions,
    assigneeOptions: buildAssigneeOptions(),
    form: defaultForm()
  },

  onShow() {
    this.setData({
      assigneeOptions: buildAssigneeOptions()
    });
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset;

    this.setData({
      [`form.${field}`]: event.detail.value
    });
  },

  handleTypeChange(event) {
    this.setData({
      "form.typeIndex": Number(event.detail.value)
    });
  },

  handleAssigneeChange(event) {
    this.setData({
      "form.assigneeIndex": Number(event.detail.value)
    });
  },

  handleDateChange(event) {
    this.setData({
      "form.dueDate": event.detail.value
    });
  },

  async addTask() {
    const { assigneeOptions, form } = this.data;
    const title = form.title.trim();
    const reward = Math.max(0, Number(form.reward) || 0);

    if (!title) {
      wx.showToast({
        title: "先写任务内容吧",
        icon: "none"
      });
      return;
    }

    const profile = getProfile();
    const selectedAssignee = assigneeOptions[form.assigneeIndex].value;
    const now = Date.now();
    const assignee = selectedAssignee === "我" && profile && profile.nickname
      ? profile.nickname
      : selectedAssignee === "对方"
        ? getPartnerNickname()
        : selectedAssignee;
    const task = {
      id: `life_task_${now}`,
      title,
      type: typeOptions[form.typeIndex].value,
      assignee,
      dueDate: form.dueDate,
      reward,
      done: false,
      createdAt: now
    };

    saveLifeTasks(getLifeTasks().concat(task));

    if (getProfile() && getProfile().coupleCode) {
      try {
        await saveCloudLifeTask(task);
      } catch (error) {
        wx.showToast({
          title: "本地已保存，云端稍后同步",
          icon: "none"
        });
      }
    }

    wx.showToast({
      title: "小任务已加入",
      icon: "success"
    });

    setTimeout(() => {
      if (getCurrentPages().length > 1) {
        wx.navigateBack();
        return;
      }

      wx.navigateTo({
        url: "/pages/tasks/tasks"
      });
    }, 500);
  }
});
