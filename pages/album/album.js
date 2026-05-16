const {
  getAlbumItems,
  getDisplayName,
  getProfile,
  saveAlbumItems
} = require("../../utils/storage");
const {
  deleteCloudAlbumItem,
  saveCloudAlbumItem,
  syncCloudAlbumItems
} = require("../../utils/cloudData");
const { startPolling, stopPolling } = require("../../utils/polling");

function formatDate(value) {
  if (!value) {
    return "";
  }

  return value.replace(/-/g, ".");
}

function formatPersonName(value) {
  return getDisplayName(value, "我");
}

function hasCloudFilePath(value) {
  return typeof value === "string" && value.indexOf("cloud://") === 0;
}

function getCloudImageId(photo) {
  if (hasCloudFilePath(photo.cloudFileId)) {
    return photo.cloudFileId;
  }

  if (hasCloudFilePath(photo.imagePath)) {
    return photo.imagePath;
  }

  if (hasCloudFilePath(photo.thumbFileId)) {
    return photo.thumbFileId;
  }

  return "";
}

function buildAlbumSignature(photos) {
  return photos
    .map((item) =>
      [
        item.id,
        item.imagePath,
        item.cloudFileId,
        item.thumbFileId,
        item.syncStatus,
        item.updatedAt,
        item.favorite,
        item.isCover,
        item.date,
        item.note,
        item.location,
        item.tag,
        item.uploader
      ].join(":")
    )
    .join("|");
}

Page({
  data: {
    photos: [],
    coverPhoto: null
  },

  __imageUrlCache: {},

  onShow() {
    this.loadPhotos();
    startPolling(this, this.loadPhotos);
  },

  onHide() {
    stopPolling(this);
  },

  onUnload() {
    stopPolling(this);
  },

  async loadPhotos(options = {}) {
    const silent = Boolean(options.silent);

    if (getProfile() && getProfile().coupleCode) {
      try {
        await syncCloudAlbumItems();
      } catch (error) {
        if (!silent) {
          wx.showToast({
            title: "云相册同步失败，先显示本地照片",
            icon: "none"
          });
        }
      }
    }

    const photos = getAlbumItems()
      .slice()
      .sort((a, b) => {
        const dateSort = String(b.date || "").localeCompare(String(a.date || ""));
        return dateSort || (b.createdAt || 0) - (a.createdAt || 0);
      })
      .map((item) => ({
        ...item,
        tag: item.tag || "日常",
        uploader: formatPersonName(item.uploader || item.updatedByName),
        dateText: formatDate(item.date),
        favoriteText: item.favorite ? "已收藏" : "收藏"
    }));
    const coverPhoto = photos.find((item) => item.isCover) || photos[0] || null;
    const albumSignature = buildAlbumSignature(photos);
    const needsImageUrl = photos.some((photo) => {
      const cloudId = getCloudImageId(photo);

      return cloudId && !this.__imageUrlCache[cloudId];
    });

    if (this.__albumSignature === albumSignature && !needsImageUrl) {
      return;
    }

    const displayPhotos = await this.resolvePhotoImageSources(photos);
    const displayCoverPhoto = displayPhotos.find((item) => item.isCover) || displayPhotos[0] || null;

    this.__albumSignature = albumSignature;

    this.setData({
      photos: displayPhotos,
      coverPhoto: displayCoverPhoto
    });
  },

  async resolvePhotoImageSources(photos) {
    this.__imageUrlCache = this.__imageUrlCache || {};

    const cloudIds = photos.map(getCloudImageId).filter(Boolean);
    const missingCloudIds = cloudIds.filter((fileId) => !this.__imageUrlCache[fileId]);

    if (missingCloudIds.length && wx.cloud && wx.cloud.getTempFileURL) {
      try {
        const result = await wx.cloud.getTempFileURL({
          fileList: Array.from(new Set(missingCloudIds))
        });

        (result.fileList || []).forEach((item) => {
          if (item.fileID && item.tempFileURL) {
            this.__imageUrlCache[item.fileID] = item.tempFileURL;
          }
        });
      } catch (error) {
        // Fall back to the original file id/path below.
      }
    }

    return photos.map((photo) => {
      const cloudId = getCloudImageId(photo);
      const displayImagePath = cloudId ? this.__imageUrlCache[cloudId] || cloudId : photo.imagePath;

      return {
        ...photo,
        displayImagePath
      };
    });
  },

  goAddPhoto() {
    wx.navigateTo({
      url: "/pages/addAlbum/addAlbum"
    });
  },

  toggleFavorite(event) {
    const { id } = event.currentTarget.dataset;
    let nextPhoto = null;

    saveAlbumItems(getAlbumItems().map((item) => {
      if (item.id !== id) {
        return item;
      }

      nextPhoto = {
        ...item,
        favorite: !item.favorite
      };

      return nextPhoto;
    }));
    this.loadPhotos();

    if (nextPhoto && getProfile() && getProfile().coupleCode) {
      saveCloudAlbumItem(nextPhoto).catch(() => {});
    }
  },

  setCover(event) {
    const { id } = event.currentTarget.dataset;
    const nextPhotos = getAlbumItems().map((item) => ({
      ...item,
      isCover: item.id === id
    }));

    saveAlbumItems(nextPhotos);
    this.loadPhotos();

    if (getProfile() && getProfile().coupleCode) {
      Promise.all(nextPhotos.map((item) => saveCloudAlbumItem(item))).catch(() => {});
    }

    wx.showToast({
      title: "封面换好啦",
      icon: "success"
    });
  },

  deletePhoto(event) {
    const { id } = event.currentTarget.dataset;
    const target = getAlbumItems().find((item) => item.id === id);

    wx.showModal({
      title: "删除照片",
      content: `确定删除「${target && target.note ? target.note : "这张照片"}」吗？`,
      confirmText: "删除",
      confirmColor: "#FF9EBB",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        const nextPhotos = getAlbumItems().filter((item) => item.id !== id);

        if (nextPhotos.length && !nextPhotos.some((item) => item.isCover)) {
          nextPhotos[0].isCover = true;
        }

        saveAlbumItems(nextPhotos);

        if (getProfile() && getProfile().coupleCode) {
          try {
            await deleteCloudAlbumItem(id);
          } catch (error) {
            wx.showToast({
              title: "本地已删除，云端稍后同步",
              icon: "none"
            });
          }

          if (nextPhotos[0] && nextPhotos[0].isCover) {
            saveCloudAlbumItem(nextPhotos[0]).catch(() => {});
          }
        }

        this.loadPhotos();
      }
    });
  }
});
