alist-enc7zip 桌面版
======================

【简介】
alist-enc7zip 是 alist 透明加密代理：上传时加密、下载/播放时解密。
本压缩包内嵌 Node.js 运行时和 enc7zip 程序，解压即用，无需安装任何环境。


【使用步骤】

1. 解压本压缩包到任意目录（如 D:\alist-enc7zip）

2. 首次使用：双击 install.bat
   - 自动检测是否已有 alist/openlist
   - 没有则提示下载 openlist（推荐，国内源）
   - 配置 enc7zip 端口
   - 生成配置文件

3. 启动服务：双击 start.bat
   - 看到 "服务启动" 字样即成功
   - 不要关闭弹出的黑色窗口（关了就停止了）

4. 浏览器访问：
   - 管理面板（配置加密）: http://127.0.0.1:5277/public/index.html
     账号 admin 密码 admin123
   - 代理入口（alist 加密访问）: http://127.0.0.1:5277

5. 停止服务：双击 stop.bat


【文件说明】

install.bat        首次安装/配置（双击）
start.bat          启动 enc7zip（双击）
stop.bat           停止 enc7zip（双击）
openlist-start.bat 启动 openlist（仅 install 下载了 openlist 才有）
openlist-stop.bat  停止 openlist
node\node.exe      Node.js 运行时（内嵌，勿删）
enc7zip\           enc7zip 程序文件（勿删）
conf\              配置目录（运行时生成）


【openlist 说明】

openlist 是 alist 的社区维护 fork，推荐使用。
install.bat 下载的 openlist 默认账号 admin 密码 123456，端口 5244。
登录后请到 openlist 管理界面修改密码并添加网盘存储。


【常见问题】

Q: start.bat 闪退？
A: 右键 start.bat → 以管理员身份运行；或检查 node\node.exe 是否存在

Q: 端口被占用？
A: 双击 install.bat 重新配置端口，或编辑 conf\config.json 修改 port 字段

Q: 加密配置在哪改？
A: 浏览器打开 http://127.0.0.1:5277/public/index.html 登录管理面板

Q: 如何开机自启？
A: 把 start.bat 的快捷方式放到 启动 文件夹（Win+R 输入 shell:startup 打开）


【原版地址】
https://github.com/traceless/alist-encrypt
