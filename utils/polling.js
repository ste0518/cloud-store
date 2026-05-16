const CLOUD_POLL_INTERVAL = 250;

function startPolling(page, task, interval = CLOUD_POLL_INTERVAL) {
  stopPolling(page);

  page.__pollingBusy = false;
  page.__pollingTimer = setInterval(() => {
    if (page.__pollingBusy) {
      return;
    }

    page.__pollingBusy = true;

    Promise.resolve(task.call(page, { silent: true }))
      .catch(() => {
        // Polling is intentionally quiet; visible errors belong to user-triggered actions.
      })
      .finally(() => {
        page.__pollingBusy = false;
      });
  }, interval);
}

function stopPolling(page) {
  if (page.__pollingTimer) {
    clearInterval(page.__pollingTimer);
    page.__pollingTimer = null;
  }

  page.__pollingBusy = false;
}

module.exports = {
  CLOUD_POLL_INTERVAL,
  startPolling,
  stopPolling
};
