Component({
  properties: {
    title: {
      type: String,
      value: ""
    },
    showBack: {
      type: Boolean,
      value: false
    }
  },

  data: {
    navStyle: "",
    titleStyle: "",
    backStyle: ""
  },

  lifetimes: {
    attached() {
      this.updateNavLayout();
    }
  },

  methods: {
    updateNavLayout() {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const menuRect = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
      const windowWidth = windowInfo.windowWidth || windowInfo.screenWidth || 375;
      const statusBarHeight = windowInfo.statusBarHeight || 0;
      const hasMenuRect = menuRect && menuRect.top && menuRect.height && menuRect.left;
      const titleTop = hasMenuRect ? menuRect.top : statusBarHeight + 8;
      const titleHeight = hasMenuRect ? menuRect.height : 34;
      const navHeight = hasMenuRect ? menuRect.bottom + 12 : statusBarHeight + 52;
      const capsuleReserve = hasMenuRect ? windowWidth - menuRect.left + 12 : 104;
      const sideInset = Math.max(capsuleReserve, 96);
      const backSize = 38;
      const backTop = titleTop + (titleHeight - backSize) / 2;

      this.setData({
        navStyle: `height:${navHeight}px;`,
        titleStyle: [
          `top:${titleTop}px`,
          `height:${titleHeight}px`,
          `line-height:${titleHeight}px`,
          `left:${sideInset}px`,
          `right:${sideInset}px`
        ].join(";"),
        backStyle: [
          `top:${backTop}px`,
          `width:${backSize}px`,
          `height:${backSize}px`,
          `line-height:${backSize}px`
        ].join(";")
      });
    },

    handleBack() {
      if (getCurrentPages().length > 1) {
        wx.navigateBack();
        return;
      }

      wx.switchTab({
        url: "/pages/index/index"
      });
    }
  }
});
