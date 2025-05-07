// ==UserScript==
// @name         BilibiliUploaderAllRender
// @namespace    https://github.com/moran0710/BilibiliUploaderAllRender
// @description  解决Bilibili不显示所有Up主的动态的逆天问题
// @author       Moran0710
// @version      0.0.1
// @match        https://t.bilibili.com/*
// @match        https://t.bilibili.com/ 
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/moran0710/BilibiliUploaderAllRender/main/user.js
// @downloadURL  https://raw.githubusercontent.com/moran0710/BilibiliUploaderAllRender/main/user.js
// @connect      api.bilibili.com
// @require      https://greasyfork.org/scripts/447362-gm-config/code/GM_config.js
// @noframes
// @run-at       document-end
// ==/UserScript==

class User {
    constructor() {
        this.mid;
        this.uploaders;
    }

    async init() {
        var resp = await fetch("https://api.bilibili.com/x/space/myinfo", { credentials: 'include' });
        if (resp.status != 200) {
            console.error("用户未登录")
            return
        }
        resp = await resp.json();
        this.mid = resp.data.mid;

        var page_num = 1;
        this.uploaders = [];
        while (true) {
            var params = new URLSearchParams(
                {
                    vmid: this.mid,
                    ps: 50,
                    pn: page_num
                }
            );
            resp = await fetch(`https://api.bilibili.com/x/relation/followings?${params}`, { credentials: 'include' });
            resp = await resp.json();

            if (resp.data.list.length === 0) {
                console.log("关注列表全部获取完毕")
                break;
            }
            console.log(`在第${page_num}页获取到${resp.data.list.length}个UP主`)

            resp.data.list.forEach((uploader, index) => {
                this.uploaders.push(new Uploader(
                    uploader.uname,
                    uploader.mid,
                    GM_getValue(uploader.mid, 0),
                    uploader.face
                )
                );
            }
            );
            page_num += 1;
        }
    }
}

class Uploader {
    constructor(name, mid, latest_time, face) {
        this.name = name;
        this.mid = mid;
        this.latest_time = latest_time;
        this.face = face;
    }

    async isUpdated() {
        var result = false;
        var params = new URLSearchParams(
            {
                host_mid: this.mid,
            }
        );
        var resp = await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?${params}`, { credentials: 'include' });
        resp = await resp.json();
        if (resp.code === -352) {
            console.log(`遭到-352风控`)
            return null;
        }
        // 只检查第0, 1两个动态：
        // console.log(resp);
        [0, 1].forEach((index, _) => {
            // 排除顶置动态
            if (resp.data.items[index].module_tag === undefined) {
                if (resp.data.items[index].modules.module_author.pub_ts > this.latest_time) {
                    // 设置最新时间
                    var old = this.latest_time
                    this.latest_time = resp.data.items[index].modules.module_author.pub_ts
                    console.log(`${this.name}设置最新时间${this.latest_time} 原先时间：${old}`)
                    result = true;
                }
            }
        });
        // 没有更新，return false
        return result
    }

}


async function getLatest() {
    // 获取用户的UID
    console.log("Bilibili");
    const user = new User();
    await user.init();

    if (!user.mid) {
        return;
    }

    console.log("获取当前登录用户MID" + user.mid)
    console.log("获取UP主数量：" + user.uploaders.length)
    // alert("获取UP主数量："+user.uploaders.length)
    // 开始修改网页
    // 清空原先的div
    const root = document.querySelector("#app > div.bili-dyn-home--member > main > section:nth-child(2) > div > div.bili-dyn-up-list__window > div");
    const all_dyn = document.querySelector("#app > div.bili-dyn-home--member > main > section:nth-child(2) > div > div.bili-dyn-up-list__window > div > div.bili-dyn-up-list__item.active");
    // const template = document.querySelector("#app > div.bili-dyn-home--member > main > section:nth-child(2) > div > div.bili-dyn-up-list__window > div > div:nth-child(3)")
    root.innerHTML = "";
    root.appendChild(all_dyn)
    const updatedUploadersStat = [];
    for (let index = 0; index < user.uploaders.length; index++) {
        const uploader = user.uploaders[index];
        await sleep(200);
        //更新数据
        const isUpdated = await uploader.isUpdated();
        //保存最新时间戳数据
        console.log(`${uploader.name}(${uploader.mid})是否更新：${isUpdated}`)
        if (isUpdated === null) {
            GM_notification({
                text: "遭遇-352风控，点击关闭进入动态页面完成验证码"
            });
            window.open(`https://space.bilibili.com/1/dynamic`, '_blank');
            break;
        } else if (isUpdated) {
            root.insertAdjacentHTML('beforeend', createNewUploaderElement(uploader));
            GM_setValue(uploader.mid, uploader.latest_time);
            updatedUploadersStat.push(1);
        } else {
            updatedUploadersStat.push(0);
        }
    }
    console.log(updatedUploadersStat);

    // 绑定委托点击事件监听器
    root.addEventListener('click', (e) => {
        const item = e.target.closest('[data-mid]');
        if (!item) return;

        const mid = item.dataset.mid;
        const uploader = user.uploaders.find(u => u.mid === mid);

        // 移除所有active状态
        root.querySelectorAll('.bili-dyn-up-list__item').forEach(el => {
            el.classList.remove('active');
        });

        // 添加当前active状态
        item.classList.add('active');

        // 删除当前元素下所有span标签
        item.querySelectorAll('span').forEach(span => span.remove());
        // 开启新标签页访问UP主动态页
        window.open(`https://space.bilibili.com/${mid}/dynamic`, '_blank');
    }
    );

}

function createNewUploaderElement(uploader) {
    const html = `<div class="bili-dyn-up-list__item" data-mid="${uploader.mid}">
    <div class="bili-dyn-up-list__item__face">
    <div class="bili-dyn-up-list__item__face__img b-img--face b-img">
    <picture class="b-img__inner"><source type="image/avif" srcset="${uploader.face}@96w_96h.avif">
    <source type="image/webp" srcset="${uploader.face}@96w_96h.webp">
    <img src="${uploader.face}@96w_96h.webp" loading="lazy" onload="bmgOnLoad(this)" onerror="bmgOnError(this)" data-onload="bmgCmptOnload" data-onerror="bmgCmptOnerror">
    </picture>
    </div>
    <span>
    </span>
    </div>
    <div class="bili-dyn-up-list__item__name bili-ellipsis">${uploader.name}</div>
    </div>`;
    return html;
}

function cleanData() {
    var len = GM_listValues().length
    GM_listValues().forEach((key, _) => {
        GM_deleteValue(key);
        // console.log(`已经删除Up主${key}的数据！`);
    });
    GM_notification(`已经清除了当前存储的${len}条Up主更新数据`)
}


function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}


(function () {
    GM_registerMenuCommand("获取Up主最新动态", getLatest)
    GM_registerMenuCommand("清除本地数据", cleanData)

    const origGetRangeAt = Selection.prototype.getRangeAt;
    Selection.prototype.getRangeAt = function (index) {
        return this.rangeCount > index ?
            origGetRangeAt.call(this, index) :
            document.createRange();
    };

    document.addEventListener('mouseup', () => {
        const sel = window.getSelection();
        if (sel.rangeCount === 0 && document.querySelector('[data-custom-dynamic]')) {
            sel.removeAllRanges();
        }
    }, true);
})();
