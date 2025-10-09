module.exports = {
  apps: [
    {
      name: 'shipsec-backend',
      cwd: __dirname + '/backend',
      script: 'bun',
      args: 'run dev',
      env_file: './backend/.env',
    },
    {
      name: 'shipsec-worker',
      cwd: __dirname + '/worker',
      script: 'npm',
      args: 'run dev',
      env_file: '../backend/.env',
    },
  ],
};
