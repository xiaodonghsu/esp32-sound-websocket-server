# ESP32 Sound WebSocket Server

## Docker 部署

镜像使用 Python 3.12，通过 uv 按 `uv.lock` 安装运行依赖。
在项目根目录构建并启动服务：

```sh
docker build -t esp32-sound-websocket-server .
docker run -d --name esp32-sound-websocket-server --restart unless-stopped -p 12345:12345 -v esp32-recordings:/app/recordings esp32-sound-websocket-server
```

客户端连接 `ws://<服务器IP>:12345/v1/recorder?segment=200&id=<会议号>`。
录音保存在 `esp32-recordings` Docker 数据卷中，按会议号分目录存储，
删除或重建容器后仍会保留。可通过以下命令查看服务日志：

```sh
docker logs -f esp32-sound-websocket-server
```

该镜像运行录音 WebSocket 服务；设备控制静态页面的部署方式见下文。

## 设备控制页面

静态控制页面位于 `web/`，支持：

- 添加、查询和删除设备；
- 选择设备并查询实时连接状态；
- 发送 `start`、`stop` 或自定义控制命令；
- 桌面与手机端自适应布局。

页面通过同源路径 `./api` 请求控制 API。部署时请参考
`deploy/nginx.conf.example` 配置 Nginx 静态目录和到
`127.0.0.1:8060` 的反向代理，最终访问地址为：

```text
http://192.168.4.244/esp32-sound-websocket-server/
```

部署前可在项目根目录执行以下命令本地预览：

```powershell
python -m http.server 8080 --directory web
```

注意：直接用上述静态服务器预览时没有 `/api` 反向代理，页面只能用于查看布局；
完整交互请通过 Nginx 配置后的地址验证。
