---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 0b4ba5e0b07e463e73f1efe4b9474bb9_cd0440e4e66311f1a9b8525400f8a581
    ReservedCode1: 3tfe7TEinjut47K3fZaLHx3TMy18HNoyWAarG1FYu3ZyC8/lQ0VWgKDPrWQzJZat0QxdKAli+r4vVetzCqcBd8jZ+rP85NJv+oS000bsjt2pkpjwr6tkj5vsxuIyJ16pYv3ftcPlxEeFc87Baytt7FOtrAFgiANQRyxEeBP4SJsdmVFiLdAo+6AzlFg=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 0b4ba5e0b07e463e73f1efe4b9474bb9_cd0440e4e66311f1a9b8525400f8a581
    ReservedCode2: 3tfe7TEinjut47K3fZaLHx3TMy18HNoyWAarG1FYu3ZyC8/lQ0VWgKDPrWQzJZat0QxdKAli+r4vVetzCqcBd8jZ+rP85NJv+oS000bsjt2pkpjwr6tkj5vsxuIyJ16pYv3ftcPlxEeFc87Baytt7FOtrAFgiANQRyxEeBP4SJsdmVFiLdAo+6AzlFg=
---

# 宝宝 · 朋友间四张牌（网页版）

小程序版本原样存档，这是它的网页版：同一套玩法、同一套深绿+金配色，去掉微信依赖，朋友用手机浏览器就能进。

## 怎么玩

1. 双击 `启动.bat`（或在本目录执行 `node server.js`）
2. 黑窗口会打印两个地址：
   - 本机：`http://localhost:8848`
   - 手机：`http://192.168.x.x:8848`（手机连同一个 WiFi 就能开）
3. 你自己先建房间，把房号发给朋友
4. 朋友打开地址，输入房号加入，人齐了点中间的大圆「发牌」

关掉黑窗口就停止服务；房间数据在内存里，重启即清空。

## 和原小程序的区别

| 项目 | 小程序版 | 网页版 |
| --- | --- | --- |
| 登录 | 微信登录（openid） | 不用登录，填个名字就进 |
| 后端 | WorkBuddy 云（mp-api.app.workbuddy.host） | 本机 Node 服务，零依赖 |
| 访问 | 需要审核上架 | 局域网直接开，发链接就玩 |
| 玩法 | 建房、发牌、摆牌、亮牌 | 完全一致 |

## 玩法要点

- 每人 4 张牌，自由拆成头、尾两组（每组 2 张），点牌翻盖，点 ⇅ 换组
- 点数只看个位：A=1，2~9 本身，10/J/Q/K 算 10，两牌相加取个位
- 对子叫「保」，保大于任何普通点数（含 9 点）
- 牌型：至尊（四条）> 麻麻（00）> 水鱼（两对）> 单保 > 普通点数
- 比牌固定头对头、尾对尾；比牌由桌上朋友当面完成

## 工具边界

只负责建房间、发牌、摆牌、亮牌。**不做自动比牌、不计任何数值、不涉及任何输赢结算。**
各地规矩不同，上桌前先问清：这局麻麻能不能杀水鱼、有没有王。

## 文件说明

```
server.js          服务端（Node 内置模块，无第三方依赖）
public/index.html  页面
public/app.js      前端逻辑
public/style.css   样式
启动.bat           一键启动
```

## 常见问题

**手机打不开？** 确认手机和电脑在同一个 WiFi；电脑防火墙可能拦了 8848 端口，允许一下即可。

**想换个端口？** 设置环境变量 `PORT=9000` 再启动。

**朋友在外地？** 用公网隧道，见下节。

## 公网访问（异地朋友）

同一 WiFi 只能同屋玩。要让外地朋友进来，保持 `server.js` 运行的前提下，再开一条隧道：

1. 双击 `开启公网.bat`
2. 窗口里会打印一行 `https://xxxx.app.lhr.life`，把它发给朋友
3. 朋友手机浏览器直接打开，输入房号即可加入

已验证：建房、加入、发牌整条链路走公网正常。

注意：

- 隧道断线或电脑重启后重新跑一次 `开启公网.bat`，**域名会变**，需重新发给朋友
- 电脑必须开机、两个黑窗口都不能关
- 隧道走 SSH 反向代理（localhost.run 免费版），高峰期速度一般，玩游戏够用
- `cloudflared.exe` 是早前尝试 Cloudflare 隧道留下的，国内网络访问不通，可删除，不影响使用
*（内容由AI生成，仅供参考）*
