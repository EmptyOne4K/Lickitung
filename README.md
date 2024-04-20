# Lickitung

This is a helper tool for [Xilriws](https://github.com/UnownHash/Xilriws-Public). It scans the Docker logs for a proxy ban and then triggers the replacement of it by changing the config in the `docker-compose.yml` Xilriws is running from. It also restarts in case of a possible crash or when replacing the proxy.

I highly recommend to NOT run it as root. I recommend running both as the same non-privileged user.
I also recommend running it seperate from unown, unless you want your whole stack to be restarted on each proxy ban.

## PM2
```shell
pm2 start main.js --name lickitung
```

## Update
```shell
git pull
pm2 restart lickitung
```