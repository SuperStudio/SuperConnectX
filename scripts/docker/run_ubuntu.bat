docker pull ubuntu:26.04
docker build -t ubuntu-full:26.04 .
docker run -itd --name ubuntu_superconnectx --privileged --tmpfs /tmp --tmpfs /run --tmpfs /run/lock -p 2323:2323/tcp ubuntu-full:26.04
docker exec -it ubuntu_superconnectx /bin/bash