const {
  getDisplayName,
  getLedger,
  getLifeTasks,
  getProfile,
  getWallet,
  saveLedger,
  saveLifeTasks,
  saveWallet
} = require("../../utils/storage");
const {
  applyCloudLedgerChange,
  deleteCloudLifeTask,
  syncCloudLifeTasks
} = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");

const typeOptions = [
  { value: "home", label: "家务", icon: "🧹" },
  { value: "buy", label: "采购", icon: "🛒" },
  { value: "errand", label: "跑腿", icon: "📦" },
  { value: "together", label: "一起完成", icon: "🤝" },
  { value: "care", label: "照顾彼此", icon: "💗" }
];

function formatDate(value) {
  if (!value) {
    return "";
  }

  const parts = value.split("-");
  return `${parts[1]}.${parts[2]}`;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${month}.${day} ${hour}:${minute}`;
}

function getTypeMeta(type) {
  return typeOptions.find((item) => item.value === type) || typeOptions[0];
}

function formatPersonName(value) {
  return getDisplayName(value, "一起");
}

function buildTask(item) {
  const meta = getTypeMeta(item.type);

  return {
    ...item,
    icon: meta.icon,
    assignee: formatPersonName(item.assignee),
    reward: Number(item.reward) || 0,
    dueDateText: formatDate(item.dueDate),
    completedAtText: item.completedAt ? formatTime(item.completedAt) : ""
  };
}

Page({
  data: {
    pendingTasks: [],
    doneTasks: [],
    pendingCount: 0,
    doneCount: 0
  },

  onShow() {
    this.loadTasks();
    startPolling(this, this.loadTasks);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadTasks(options = {}) {
    const silent = Boolean(options.silent);

    if (getProfile() && getProfile().coupleCode) {
      try {
        await syncCloudLifeTasks();
      } catch (error) {
        if (!silent) {
          wx.showToast({
            title: "云任务同步失败，先显示本地任务",
            icon: "none"
          });
        }
      }
    }

    const tasks = getLifeTasks()
      .map(buildTask)
      .sort((a, b) => {
        if (a.done !== b.done) {
          return a.done ? 1 : -1;
        }

        return String(a.dueDate || "").localeCompare(String(b.dueDate || "")) || (b.createdAt || 0) - (a.createdAt || 0);
      });
    const pendingTasks = tasks.filter((item) => !item.done);
    const doneTasks = tasks.filter((item) => item.done);

    this.setData({
      pendingTasks,
      doneTasks,
      pendingCount: pendingTasks.length,
      doneCount: doneTasks.length
    });
  },

  goAddTask() {
    wx.navigateTo({
      url: "/pages/addTask/addTask"
    });
  },

  async toggleTask(event) {
    const { id } = event.currentTarget.dataset;
    const now = Date.now();
    let completedTask = null;
    let changedTask = null;
    const nextTasks = getLifeTasks().map((item) => {
      if (item.id !== id) {
        return item;
      }

      const nextDone = !item.done;
      const nextTask = {
        ...item,
        done: nextDone,
        completedAt: nextDone ? now : "",
        rewardGiven: item.rewardGiven || nextDone
      };

      if (nextDone && !item.rewardGiven) {
        completedTask = nextTask;
      }

      changedTask = nextTask;
      return nextTask;
    });

    saveLifeTasks(nextTasks);

    if (changedTask && getProfile() && getProfile().coupleCode) {
      try {
        await saveCloudLifeTask(changedTask);
      } catch (error) {
        wx.showToast({
          title: "本地已更新，云端稍后同步",
          icon: "none"
        });
      }
    }

    if (completedTask && Number(completedTask.reward) > 0) {
      await this.addTaskReward(completedTask);
    }

    this.loadTasks();
  },

  async addTaskReward(task) {
    const reward = Number(task.reward) || 0;
    const now = Date.now();

    if (getProfile() && getProfile().coupleCode) {
      try {
        await applyCloudLedgerChange({
          id: `ledger_task_${task.id}_${now}`,
          type: "earn",
          amount: reward,
          reason: `完成小任务：${task.title}`,
          createdAt: now
        });

        wx.showToast({
          title: `完成啦 +${reward}`,
          icon: "success"
        });
        return;
      } catch (error) {
        wx.showToast({
          title: error.message || "云奖励记录失败",
          icon: "none"
        });
        return;
      }
    }

    const wallet = getWallet();
    const nextWallet = {
      ...wallet,
      balance: wallet.balance + reward,
      totalEarned: wallet.totalEarned + reward,
      updatedAt: now
    };
    const record = {
      id: `ledger_task_${task.id}_${now}`,
      type: "earn",
      amount: reward,
      reason: `完成小任务：${task.title}`,
      createdAt: now
    };

    saveWallet(nextWallet);
    saveLedger(getLedger().concat(record));

    wx.showToast({
      title: `完成啦 +${reward}`,
      icon: "success"
    });
  },

  deleteTask(event) {
    const { id } = event.currentTarget.dataset;
    const target = getLifeTasks().find((item) => item.id === id);

    wx.showModal({
      title: "删除小任务",
      content: `确定删除「${target ? target.title : "这个任务"}」吗？`,
      confirmText: "删除",
      confirmColor: "#FF9EBB",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        saveLifeTasks(getLifeTasks().filter((item) => item.id !== id));

        if (getProfile() && getProfile().coupleCode) {
          try {
            await deleteCloudLifeTask(id);
          } catch (error) {
            wx.showToast({
              title: "本地已删除，云端稍后同步",
              icon: "none"
            });
          }
        }

        this.loadTasks();
      }
    });
  }
});
