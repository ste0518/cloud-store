const {
  getAlbumItems,
  getProfile,
  saveAlbumItems
} = require("../../utils/storage");
const {
  saveCloudAlbumItem,
  uploadCloudImage
} = require("../../utils/cloudData");

const tags = [
  { value: "约会", label: "约会" },
  { value: "吃饭", label: "吃饭" },
  { value: "旅行", label: "旅行" },
  { value: "节日", label: "节日" },
  { value: "日常", label: "日常" },
  { value: "好笑瞬间", label: "好笑瞬间" },
  { value: "想反复看", label: "想反复看" }
];

function todayText() {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function defaultForm() {
  const profile = getProfile();

  return {
    imagePath: "",
    date: todayText(),
    note: "",
    location: "",
    tag: "约会",
    uploader: profile && profile.nickname ? profile.nickname : "我"
  };
}

function upsertLocalPhoto(photo) {
  const photos = getAlbumItems();
  const exists = photos.some((item) => item.id === photo.id);

  if (!exists) {
    saveAlbumItems(photos.concat(photo));
    return;
  }

  saveAlbumItems(photos.map((item) => (item.id === photo.id ? photo : item)));
}

function compressImageForUpload(filePath, quality = 70) {
  return new Promise((resolve) => {
    if (!wx.compressImage || !filePath || filePath.indexOf("cloud://") === 0) {
      resolve(filePath);
      return;
    }

    wx.compressImage({
      src: filePath,
      quality,
      success: (res) => {
        resolve(res.tempFilePath || filePath);
      },
      fail: () => {
        resolve(filePath);
      }
    });
  });
}

Page({
  data: {
    tags,
    form: defaultForm()
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset;

    this.setData({
      [`form.${field}`]: event.detail.value
    });
  },

  handleDateChange(event) {
    this.setData({
      "form.date": event.detail.value
    });
  },

  chooseTag(event) {
    this.setData({
      "form.tag": event.currentTarget.dataset.tag
    });
  },

  choosePhoto() {
    const handleChosenPath = (tempFilePath) => {
      if (!tempFilePath) {
        return;
      }

      wx.saveFile({
        tempFilePath,
        success: (saveRes) => {
          this.setData({
            "form.imagePath": saveRes.savedFilePath
          });
        },
        fail: () => {
          this.setData({
            "form.imagePath": tempFilePath
          });
        }
      });
    };

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
        success: (res) => {
          handleChosenPath(res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath);
        }
      });
      return;
    }

    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        handleChosenPath(res.tempFilePaths && res.tempFilePaths[0]);
      }
    });
  },

  async addPhoto() {
    const { form } = this.data;

    if (!form.imagePath) {
      wx.showToast({
        title: "先选一张照片吧",
        icon: "none"
      });
      return;
    }

    const now = Date.now();
    const currentPhotos = getAlbumItems();
    const photo = {
      id: `photo_${now}`,
      imagePath: form.imagePath,
      cloudFileId: "",
      date: form.date,
      note: form.note.trim(),
      location: form.location.trim(),
      tag: form.tag,
      uploader: form.uploader.trim() || "我",
      favorite: false,
      isCover: currentPhotos.length === 0,
      createdAt: now
    };

    upsertLocalPhoto(photo);

    if (getProfile() && getProfile().coupleCode) {
      this.uploadAndSyncPhoto(photo);
    }

    wx.showToast({
      title: getProfile() && getProfile().coupleCode ? "照片收好啦，正在同步" : "照片收好啦",
      icon: "success"
    });

    setTimeout(() => {
      if (getCurrentPages().length > 1) {
        wx.navigateBack();
        return;
      }

      wx.navigateTo({
        url: "/pages/album/album"
      });
    }, 500);
  },

  async uploadAndSyncPhoto(photo) {
    try {
      const previewPath = await compressImageForUpload(photo.imagePath, 25);
      const thumbFileId = await uploadCloudImage(previewPath, "album/thumbs");
      const previewPhoto = {
        ...photo,
        imagePath: thumbFileId || photo.imagePath,
        thumbFileId: thumbFileId || "",
        syncStatus: "preview"
      };

      upsertLocalPhoto(previewPhoto);
      await saveCloudAlbumItem(previewPhoto);

      const uploadPath = await compressImageForUpload(photo.imagePath, 65);
      const cloudFileId = await uploadCloudImage(uploadPath, "album");
      const syncedPhoto = {
        ...previewPhoto,
        imagePath: cloudFileId || photo.imagePath,
        cloudFileId: cloudFileId || "",
        syncStatus: "ready"
      };

      upsertLocalPhoto(syncedPhoto);
      await saveCloudAlbumItem(syncedPhoto);
    } catch (error) {
      wx.showToast({
        title: "照片已保存在本机，云端上传失败",
        icon: "none"
      });
    }
  }
});
