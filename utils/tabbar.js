function setTabBarSelected(page, selected) {
  if (typeof page.getTabBar === "function" && page.getTabBar()) {
    page.getTabBar().setData({
      selected
    });
  }
}

module.exports = {
  setTabBarSelected
};
