module.exports = {
  apps: [
    {
      name: 'rac-cloud',
      script: 'npx',
      args: 'wrangler pages dev .open-next/cloudflare --d1=DB:rac-cloud-db --local --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
