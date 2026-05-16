const {
  getAnniversaries,
  getProfile,
  saveAnniversaries
} = require("../../utils/storage");
const {
  deleteCloudAnniversary,
  syncCloudAnniversaries
} = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value) {
  const parts = String(value || "").split("-").map(Number);
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

function dayDiff(fromDate, toDate) {
  const diff = startOfDay(toDate).getTime() - startOfDay(fromDate).getTime();
  return Math.round(diff / 86400000);
}

function formatDate(value) {
  return String(value || "").replace(/-/g, ".");
}

function getNextDate(value) {
  const today = startOfDay(new Date());
  const source = parseDate(value);
  let next = new Date(today.getFullYear(), source.getMonth(), source.getDate());

  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, source.getMonth(), source.getDate());
  }

  return next;
}

function buildAnniversary(item) {
  const today = new Date();
  const date = parseDate(item.date);
  const passedDays = Math.max(0, dayDiff(date, today));
  const nextDate = getNextDate(item.date);
  const daysToNext = Math.max(0, dayDiff(today, nextDate));
  const progressText = item.type === "love" ? `已经第 ${passedDays + 1} 天` : `已经过去 ${passedDays} 天`;

  return {
    ...item,
    icon: item.icon || "💗",
    dateText: formatDate(item.date),
    nextText: daysToNext === 0 ? "今天就是纪念日" : `距离下次还有 ${daysToNext} 天`,
    daysToNext,
    daysToNextText: daysToNext === 0 ? "今天" : `${daysToNext} 天`,
    progressText
  };
}

Page({
  data: {
    items: [],
    nearest: null
  },

  onShow() {
    this.loadAnniversaries();
    startPolling(this, this.loadAnniversaries);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadAnniversaries(options = {}) {
    const silent = Boolean(options.silent);

    if (getProfile() && getProfile().coupleCode) {
      try {
        await syncCloudAnniversaries();
      } catch (error) {
        if (!silent) {
          wx.showToast({
            title: "云纪念日同步失败，先显示本地记录",
            icon: "none"
          });
        }
      }
    }

    const items = getAnniversaries()
      .map(buildAnniversary)
      .sort((a, b) => a.daysToNext - b.daysToNext || (b.createdAt || 0) - (a.createdAt || 0));

    this.setData({
      items,
      nearest: items[0] || null
    });
  },

  goAddAnniversary() {
    wx.navigateTo({
      url: "/pages/addAnniversary/addAnniversary"
    });
  },

  deleteAnniversary(event) {
    const { id } = event.currentTarget.dataset;
    const target = getAnniversaries().find((item) => item.id === id);

    wx.showModal({
      title: "删除纪念日",
      content: `确定删除「${target ? target.title : "这个纪念日"}」吗？`,
      confirmText: "删除",
      confirmColor: "#FF9EBB",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        saveAnniversaries(getAnniversaries().filter((item) => item.id !== id));

        if (getProfile() && getProfile().coupleCode) {
          try {
            await deleteCloudAnniversary(id);
          } catch (error) {
            wx.showToast({
              title: "本地已删除，云端稍后同步",
              icon: "none"
            });
          }
        }

        this.loadAnniversaries();
      }
    });
  }
});
