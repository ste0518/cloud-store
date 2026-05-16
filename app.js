App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        traceUser: true
      });
    }
  },

  globalData: {
    appName: "甜蜜订单 Sweet Order"
  }
});
