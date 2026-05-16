Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/index/index",
        text: "首页",
        icon: "🏠"
      },
      {
        pagePath: "/pages/menu/menu",
        text: "菜单",
        icon: "🍳"
      },
      {
        pagePath: "/pages/cart/cart",
        text: "点单",
        icon: "🧺"
      },
      {
        pagePath: "/pages/coupons/coupons",
        text: "奖券",
        icon: "🎟️"
      },
      {
        pagePath: "/pages/random/random",
        text: "决策",
        icon: "🎡"
      }
    ]
  },

  methods: {
    switchTab(event) {
      const { path, index } = event.currentTarget.dataset;

      this.setData({
        selected: index
      });

      wx.switchTab({
        url: path
      });
    }
  }
});
