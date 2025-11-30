import socket
import threading
import time
from datetime import datetime

# 服务端配置
HOST = "0.0.0.0"  # 监听所有网络接口
PORT = 2323  # 自定义端口（默认 Telnet 端口 23，需管理员权限，此处用 2323 避免冲突）
INTERVAL = 1  # 数据推送间隔（秒）


def handle_client(client_socket: socket.socket, client_addr: tuple):
    """处理单个客户端连接：持续推送数据"""
    print(f"✅ 新客户端连接：{client_addr}")
    try:
        # 1. 连接成功后发送欢迎信息
        welcome_msg = (
            "=====================================\r\n"
            "SuperSSH Telnet TestServer\r\n"
            f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\r\n"
            "press Ctrl+] and enter quit to exit\r\n"
            "=====================================\r\n"
        )
        client_socket.send(welcome_msg.encode("utf-8"))

        # 2. 持续推送数据（计数器 + 时间 + 模拟日志）
        counter = 0
        while True:
            counter += 1
            # 构造推送数据（可自定义格式，如 JSON、纯文本）
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[
                :-3
            ]  # 精确到毫秒
            data = (
                f"[{current_time}] "
                f"counter: {counter:04d} | "
                f"now is running | "
                f"client: {client_addr[0]}:{client_addr[1]}\r\n"
            )
            # 发送数据（Telnet 客户端默认接收 ASCII 编码，此处用 UTF-8 兼容中文）
            client_socket.send(data.encode("utf-8"))
            # 间隔指定时间再推送下一条
            time.sleep(INTERVAL)

    except BrokenPipeError:
        print(f"❌ 客户端 {client_addr} 断开连接（主动关闭）")
    except Exception as e:
        print(f"❌ 客户端 {client_addr} 连接异常：{str(e)}")
    finally:
        # 关闭客户端连接
        client_socket.close()
        print(f"🔌 客户端 {client_addr} 连接已关闭")


def start_telnet_server():
    """启动 Telnet 服务端"""
    # 创建 TCP 套接字（Telnet 基于 TCP 协议）
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # 允许端口复用（避免服务重启时提示端口被占用）
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    # 绑定地址和端口
    server_socket.bind((HOST, PORT))
    # 开始监听（最大等待连接数 5）
    server_socket.listen(5)
    print(f"🚀 Telnet 服务端已启动，监听 {HOST}:{PORT}")
    print(
        f"ℹ️  客户端可通过：telnet {HOST.split('0.0.0.0')[0] if HOST == '0.0.0.0' else HOST} {PORT} 连接"
    )

    try:
        # 循环接收客户端连接（主线程阻塞）
        while True:
            # 接收客户端连接（阻塞直到有客户端连接）
            client_socket, client_addr = server_socket.accept()
            # 为每个客户端创建独立线程处理（避免单客户端阻塞所有连接）
            client_thread = threading.Thread(
                target=handle_client,
                args=(client_socket, client_addr),
                daemon=True,  # 主线程退出时自动关闭子线程
            )
            client_thread.start()
            # 打印当前连接数
            print(
                f"ℹ️ 当前在线客户端数：{threading.active_count() - 1}"
            )  # 减 1 排除主线程

    except KeyboardInterrupt:
        print("\n⚠️  收到退出信号，正在关闭服务端...")
    finally:
        server_socket.close()
        print("🛑 Telnet 服务端已关闭")


if __name__ == "__main__":
    start_telnet_server()
