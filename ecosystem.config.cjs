module.exports = {
  apps: [
    {
      name: "chatgpt-nodejs",
      script: "./index.js",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3040
      }
    }
  ]
};
