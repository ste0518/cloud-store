const { getCart, getDishes, saveCart } = require("../../utils/storage");
const { syncCloudDishes } = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");
const { setTabBarSelected } = require("../../utils/tabbar");

Page({
  data: {
    isSpinning: false,
    result: null,
    dishCount: 0
  },

  onShow() {
    setTabBarSelected(this, 4);
    this.loadDecisionData();
    startPolling(this, this.loadDecisionData);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadDecisionData() {
    try {
      await syncCloudDishes();
    } catch (error) {
      // Keep the local menu available when cloud sync is temporarily unavailable.
    }

    this.setData({
      dishCount: getDishes().length
    });
  },

  async startRandom() {
    if (this.data.isSpinning) {
      return;
    }

    try {
      await syncCloudDishes();
    } catch (error) {
      // Local cache is enough for a quick decision if the network is sleepy.
    }

    const pool = getDishes();

    if (pool.length === 0) {
      wx.showToast({
        title: "菜单还空着，先添加一道菜吧",
        icon: "none"
      });
      return;
    }

    this.setData({
      isSpinning: true,
      result: null
    });

    setTimeout(() => {
      const index = Math.floor(Math.random() * pool.length);

      this.setData({
        isSpinning: false,
        result: pool[index]
      });
    }, 700);
  },

  addDishToCart() {
    const dish = this.data.result;

    if (!dish) {
      return;
    }

    const cart = getCart();
    const hasAdded = cart.some((item) => {
      const dishId = typeof item === "string" ? item : item.dishId || item.id;
      return dishId === dish.id;
    });

    if (hasAdded) {
      wx.showToast({
        title: "已经在今日点单里啦",
        icon: "none"
      });
      return;
    }

    saveCart(
      cart.concat({
        dishId: dish.id,
        addedAt: Date.now()
      })
    );

    wx.showToast({
      title: "已放进小篮子",
      icon: "success"
    });
  },

  goAddDish() {
    wx.navigateTo({
      url: "/pages/addDish/addDish"
    });
  },

  goBlindVote() {
    wx.navigateTo({
      url: "/pages/blindVote/blindVote"
    });
  }
});
