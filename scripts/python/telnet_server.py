import socket
import threading
import time
from datetime import datetime

# 服务端配置
HOST = "0.0.0.0"  # 监听所有网络接口
PORT = 2323  # 自定义端口（默认 Telnet 端口 23，需管理员权限，此处用 2323 避免冲突）
INTERVAL = 1  # 数据推送间隔（秒）


def handle_client(client_socket: socket.socket, client_addr: tuple):
    """处理单个客户端连接：接收命令并响应 + 持续推送数据"""
    print(f"✅ 新客户端连接：{client_addr}")
    try:
        # 发送欢迎信息
        welcome_msg = (
            "=====================================\r\n"
            "SuperConnectX Telnet TestServer\r\n"
            f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\r\n"
            "press Ctrl+] and enter quit to exit\r\n"
            "支持命令：hello、time、exit\r\n"
            "=====================================\r\n"
        )
        client_socket.send(welcome_msg.encode("utf-8"))

        counter = 0
        # 设置非阻塞模式（避免recv阻塞导致无法定时推送）
        client_socket.setblocking(False)

        while True:
            # 1. 处理客户端命令（非阻塞读取）
            try:
                # 读取客户端发送的数据（最多1024字节）
                cmd = client_socket.recv(1024).decode("utf-8").strip()
                if cmd:
                    print(f"📥 收到 {client_addr} 的命令：{cmd}")
                    # 命令处理逻辑
                    if cmd.lower() == "hello":
                        response = "👋 你好！这是Telnet测试服务器\r\n"
                    elif cmd.lower() == "time":
                        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        response = f"⏰ 当前时间：{current_time}\r\n"
                    elif cmd.lower() == "exit":
                        response = "👋 正在断开连接...\r\n"
                        client_socket.send(response.encode("utf-8"))
                        break  # 退出循环，关闭连接
                    else:
                        response = (
                            f"❓ 未知命令：{cmd}，支持的命令：hello、time、exit\r\n"
                        )
                    client_socket.send(response.encode("utf-8"))
            except BlockingIOError:
                # 无数据时正常忽略（非阻塞模式下没有数据会抛出此异常）
                pass

            # 2. 持续推送数据
            counter += 1
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            data = (
                f"[{current_time}] "
                f"counter: {counter:04d} | "
                f"now is running | "
                f"client: {client_addr[0]}:{client_addr[1]}\r\n"
            )
            client_socket.send(data.encode("utf-8"))
            time.sleep(INTERVAL)

    except BrokenPipeError:
        print(f"❌ 客户端 {client_addr} 断开连接（主动关闭）")
    except Exception as e:
        print(f"❌ 客户端 {client_addr} 连接异常：{str(e)}")
    finally:
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
