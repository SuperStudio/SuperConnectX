# 基于官方 Ubuntu 镜像（选择你需要的版本，如22.04、20.04、18.04）
FROM ubuntu:26.04

# 设置时区（避免后续安装包时时区交互）
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 安装完整版所需的包（包含基础工具、网络工具、系统工具、编辑器等）
RUN apt update && apt install -y \
    # 基础系统工具
    lsb-release \
    systemd \
    systemd-sysv \
    sudo \
    apt-utils \
    # 网络工具（telnet、ping、netstat、ifconfig等）
    telnet \
    iputils-ping \
    net-tools \
    iproute2 \
    # 编辑器
    vim \
    nano \
    # 服务管理（xinetd、telnetd等，如果你需要telnet服务）
    xinetd \
    telnetd \
    # 其他常用工具
    wget \
    curl \
    unzip \
    tar \
    && apt clean && rm -rf /var/lib/apt/lists/*

# 修复 systemd 在容器中的运行问题（关键：Docker 容器默认不启动 systemd）
RUN mkdir -p /run/systemd && echo 'docker' > /run/systemd/container

# 设置容器启动时运行 systemd（替代默认的bash）
CMD ["/sbin/init"]