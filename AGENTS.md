# websocket 服务端

该python项目采用 uv 做环境管理，实现一个基于 websocket 的 录音文件采集 服务器。

## 功能

客户端请求链接为：

```URL
ws://192.168.41.15:12345/v1/recorder?segment=200&id=xxxxxxxxxxxxxxxxxxxxx
```

其中，id 为会议号,segment默认是200ms的分割，

服务端按照会议号生成文件目录，并将录音文件保存在该目录下

录音以PCM方式上报,以下为默认值
- 采样率：: 16kHz
- bit率: 16 bit
- 通道: 单声道
