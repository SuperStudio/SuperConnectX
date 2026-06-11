import socket
import threading
import time
from datetime import datetime
import json
import sys
import random

# 服务端配置
PORT = 6666  # 自定义端口（默认 Telnet 端口 23，需管理员权限，此处用 2323 避免冲突）
DEFAULT_SEND_INTERVAL = 0.1  # 数据推送间隔（秒）

send_interval = DEFAULT_SEND_INTERVAL
current_host = ""

# ===== ANSI 颜色/样式常量 =====
ANSI_RESET = "\033[0m"
ANSI_BOLD = "\033[1m"
ANSI_DIM = "\033[2m"
ANSI_ITALIC = "\033[3m"
ANSI_UNDERLINE = "\033[4m"
ANSI_BLINK = "\033[5m"
ANSI_INVERT = "\033[7m"

ANSI_FG_BLACK = "\033[30m"
ANSI_FG_RED = "\033[31m"
ANSI_FG_GREEN = "\033[32m"
ANSI_FG_YELLOW = "\033[33m"
ANSI_FG_BLUE = "\033[34m"
ANSI_FG_MAGENTA = "\033[35m"
ANSI_FG_CYAN = "\033[36m"
ANSI_FG_WHITE = "\033[37m"

ANSI_FG_BRIGHT_BLACK = "\033[90m"
ANSI_FG_BRIGHT_RED = "\033[91m"
ANSI_FG_BRIGHT_GREEN = "\033[92m"
ANSI_FG_BRIGHT_YELLOW = "\033[93m"
ANSI_FG_BRIGHT_BLUE = "\033[94m"
ANSI_FG_BRIGHT_MAGENTA = "\033[95m"
ANSI_FG_BRIGHT_CYAN = "\033[96m"
ANSI_FG_BRIGHT_WHITE = "\033[97m"

ANSI_BG_BLACK = "\033[40m"
ANSI_BG_RED = "\033[41m"
ANSI_BG_GREEN = "\033[42m"
ANSI_BG_YELLOW = "\033[43m"
ANSI_BG_BLUE = "\033[44m"
ANSI_BG_MAGENTA = "\033[45m"
ANSI_BG_CYAN = "\033[46m"
ANSI_BG_WHITE = "\033[47m"

ANSI_BG_BRIGHT_BLACK = "\033[100m"
ANSI_BG_BRIGHT_RED = "\033[101m"
ANSI_BG_BRIGHT_GREEN = "\033[102m"
ANSI_BG_BRIGHT_YELLOW = "\033[103m"
ANSI_BG_BRIGHT_BLUE = "\033[104m"
ANSI_BG_BRIGHT_MAGENTA = "\033[105m"
ANSI_BG_BRIGHT_CYAN = "\033[106m"
ANSI_BG_BRIGHT_WHITE = "\033[107m"

# 颜色列表（用于随机颜色输出）
COLOR_POOL = [
    ANSI_FG_RED, ANSI_FG_GREEN, ANSI_FG_YELLOW, ANSI_FG_BLUE,
    ANSI_FG_MAGENTA, ANSI_FG_CYAN,
    ANSI_FG_BRIGHT_RED, ANSI_FG_BRIGHT_GREEN, ANSI_FG_BRIGHT_YELLOW,
    ANSI_FG_BRIGHT_BLUE, ANSI_FG_BRIGHT_MAGENTA, ANSI_FG_BRIGHT_CYAN,
]


def ansi_color(text: str, fg: str = "", bg: str = "", style: str = "") -> str:
    """给文本包裹 ANSI 颜色/样式码"""
    prefix = fg + bg + style
    return f"{prefix}{text}{ANSI_RESET}"


def ansi_random_color(text: str) -> str:
    """随机前景色"""
    return f"{random.choice(COLOR_POOL)}{text}{ANSI_RESET}"


def build_simulated_ls_output() -> str:
    """模拟 Linux ls --color=auto 的输出"""
    lines = []
    # 目录（蓝色加粗）
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}application{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}bin{ANSI_RESET}")
    lines.append(f"{ANSI_FG_GREEN}default.prop{ANSI_RESET}")
    lines.append(f"{ANSI_FG_CYAN}init.rc{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_CYAN}init.wayland.rc{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}lib{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}dev{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}etc{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}root{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}sbin{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}sys{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_CYAN}home{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}lib64{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_CYAN}system{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_CYAN}init{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_CYAN}linuxrc{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}tmp{ANSI_RESET}")
    lines.append(f"{ANSI_FG_GREEN}init.environ.rc{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_CYAN}media{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_GREEN}init.gui.rc{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_CYAN}mnt{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_BLUE}usr{ANSI_RESET}")
    lines.append(f"{ANSI_BOLD}{ANSI_FG_CYAN}var{ANSI_RESET}")
    return " ".join(lines)


def build_colored_status() -> str:
    """模拟带有颜色的系统状态信息"""
    lines = []
    lines.append(ansi_color("[INFO]", fg=ANSI_FG_GREEN, style=ANSI_BOLD) + "  System boot complete")
    lines.append(ansi_color("[WARN]", fg=ANSI_FG_YELLOW, style=ANSI_BOLD) + "  Disk usage: 78%")
    lines.append(ansi_color("[ERROR]", fg=ANSI_FG_RED, style=ANSI_BOLD) + "  Failed to mount /mnt/data")
    lines.append(ansi_color("[DEBUG]", fg=ANSI_FG_CYAN) + "  PID 1234 listening on port 8080")
    lines.append(ansi_color("[OK]", fg=ANSI_FG_GREEN, style=ANSI_BOLD) + "    Service sshd running")
    lines.append(ansi_color("[OK]", fg=ANSI_FG_GREEN, style=ANSI_BOLD) + "    Service nginx running")
    lines.append(ansi_color("[FAIL]", fg=ANSI_FG_RED, style=ANSI_BOLD) + "  Service mysql stopped")
    lines.append(ansi_color("[>>>]", fg=ANSI_FG_BRIGHT_YELLOW, style=ANSI_BLINK) + "  Upgrade available: v2.4.1")
    return "\n".join(lines)


def _build_json(size):
    data = {}
    for i in range(size):
        data[f"key{i}"] = f"value{i}"

    return json.dumps(data) + "\n"


def handle_cmd(cmd: str):
    global send_interval  # 声明使用全局变量
    print(f"recv {cmd}")
    rsp = "not support cmd\n"
    # 命令处理逻辑
    if cmd.startswith("setInterval"):
        send_interval = float(cmd.split(",")[-1])
        rsp = f"set interval ok: {send_interval}s\n"
    elif cmd == "jsonBig":
        rsp = _build_json(10000)
    elif cmd == "jsonExtraBig":
        rsp = _build_json(100000)
    elif cmd == "jsonNormal":
        rsp = _build_json(100)
    elif cmd == "ls":
        # 模拟 Linux ls --color=auto 输出
        rsp = build_simulated_ls_output() + "\r\n"
    elif cmd == "status":
        rsp = build_colored_status() + "\r\n"
    elif cmd == "rainbow":
        # 彩虹色文本
        text = "Hello from SuperConnectX Telnet Server!"
        rainbow = "".join(ansi_random_color(ch) for ch in text)
        rsp = rainbow + "\r\n"
    elif cmd == "help":
        rsp = (
            ansi_color("=== Available Commands ===", fg=ANSI_FG_CYAN, style=ANSI_BOLD) + "\r\n"
            f"  {ansi_color('ls', fg=ANSI_FG_GREEN)}        - Simulate ls --color=auto output\r\n"
            f"  {ansi_color('status', fg=ANSI_FG_GREEN)}    - Show colored system status\r\n"
            f"  {ansi_color('rainbow', fg=ANSI_FG_GREEN)}   - Rainbow colored text\r\n"
            f"  {ansi_color('jsonNormal', fg=ANSI_FG_GREEN)} - JSON with 100 keys\r\n"
            f"  {ansi_color('jsonBig', fg=ANSI_FG_GREEN)}    - JSON with 10000 keys\r\n"
            f"  {ansi_color('exit', fg=ANSI_FG_RED)}       - Disconnect\r\n"
            f"  {ansi_color('setInterval,N', fg=ANSI_FG_YELLOW)} - Set push interval to N seconds\r\n"
        )

    return rsp


def handle_client_recv(client_socket: socket.socket, client_addr: tuple):
    while True:
        # 1. 处理客户端命令（非阻塞读取）
        try:
            # 读取客户端发送的数据（最多1024字节）
            cmd = client_socket.recv(1024).decode("utf-8").strip()
            if cmd == "exit":
                client_socket.send(
                    ansi_color("== goodbye ==", fg=ANSI_FG_RED, style=ANSI_BOLD).encode("utf-8") + b"\r\n"
                )
                break
            elif cmd:
                rsp = handle_cmd(cmd)
                if rsp:
                    client_socket.send(rsp.encode("utf-8"))
        except BlockingIOError:
            # 无数据时正常忽略（非阻塞模式下没有数据会抛出此异常）
            pass


def handle_client(client_socket: socket.socket, client_addr: tuple):
    """处理单个客户端连接：接收命令并响应 + 持续推送数据"""
    print(f"✅ 新客户端连接：{client_addr}")
    try:
        # 发送欢迎信息
        welcome_msg = (
            ansi_color("=====================================", fg=ANSI_FG_CYAN, style=ANSI_BOLD) + "\r\n"
            + ansi_color("SuperConnectX Telnet TestServer", fg=ANSI_FG_GREEN, style=ANSI_BOLD) + "\r\n"
            + ansi_color(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", fg=ANSI_FG_YELLOW) + "\r\n"
            + ansi_color("press Ctrl+] and enter quit to exit", fg=ANSI_FG_BRIGHT_BLACK) + "\r\n"
            + ansi_color("type 'help' for available commands", fg=ANSI_FG_BRIGHT_BLACK) + "\r\n"
            + ansi_color("=====================================", fg=ANSI_FG_CYAN, style=ANSI_BOLD) + "\r\n"
        )
        client_socket.send(welcome_msg.encode("utf-8"))

        counter = 0
        expand_counter = 0  # 每5s递增，控制数据量扩大倍数
        last_expand_time = time.time()
        # 设置非阻塞模式（避免recv阻塞导致无法定时推送）
        client_socket.setblocking(False)

        while True:
            # 持续推送数据
            counter += 1
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            base_data = (
                f"[server-{current_time}] "
                f"counter: {ansi_color(f'{counter:04d}', fg=ANSI_FG_YELLOW)} | "
                f"now is running | "
                f"server: {ansi_color(f'{current_host}:{PORT}', fg=ANSI_FG_CYAN)} | "
                f"client: {ansi_color(f'{client_addr[0]}:{client_addr[1]}', fg=ANSI_FG_MAGENTA)}"
            )

            # 每隔5s，将待发送数据扩大10倍（用 \n 连接）
            now = time.time()
            if now - last_expand_time >= 5.0:
                expand_counter += 1
                last_expand_time = now
                if expand_counter == 5:
                    expand_counter = 1
                print(f"[expand] expand_counter={expand_counter}, base_data will be repeated {expand_counter * 10} times")

            repeat_count = max(1, expand_counter * 10)
            data = "\n".join([base_data] * repeat_count) + "\r\n"
            client_socket.send(data.encode("utf-8"))
            time.sleep(send_interval)

    except BrokenPipeError:
        print(f"❌ 客户端 {client_addr} 断开连接（主动关闭）")
    except Exception as e:
        print(f"❌ 客户端 {client_addr} 连接异常：{str(e)}")
    finally:
        client_socket.close()
        print(f"🔌 客户端 {client_addr} 连接已关闭")


def start_telnet_server(host):
    global current_host
    current_host = host
    """启动 Telnet 服务端"""
    # 创建 TCP 套接字（Telnet 基于 TCP 协议）
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # 允许端口复用（避免服务重启时提示端口被占用）
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    # 绑定地址和端口
    server_socket.bind((host, PORT))
    # 开始监听（最大等待连接数 5）
    server_socket.listen(5)
    print(f"🚀 Telnet 服务端已启动，监听 {host}:{PORT}")
    print(
        f"ℹ️  客户端可通过：telnet {host.split('0.0.0.0')[0] if host == '0.0.0.0' else host} {PORT} 连接"
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
            recv_thread = threading.Thread(
                target=handle_client_recv,
                args=(client_socket, client_addr),
                daemon=True,  # 主线程退出时自动关闭子线程
            )
            recv_thread.start()
            # 打印当前连接数
            print(
                f"ℹ️ 当前在线客户端数：{(threading.active_count() - 1) / 2}"
            )  # 减 1 排除主线程

    except KeyboardInterrupt:
        print("\n⚠️  收到退出信号，正在关闭服务端...")
    finally:
        server_socket.close()
        print("🛑 Telnet 服务端已关闭")


if __name__ == "__main__":
    ip = sys.argv[1]
    start_telnet_server(ip)
