// Lickitung v0.0.1

// Config

const { proxy_cooldown, check_cycle_time, docker_container_yml } = require('./config.json');

// DO NOT CHANGE UNLESS YOU KNOW EXACTLY WHAT YOU ARE DOING //

const proxy_list_file = 'proxies.txt';
const docker_worker_container_name = 'repo_xilriws-worker_[<WORKER_ID>]';
const docker_logs_check_phrases = 
[
	"Didn't pass JS check",
	"30 consecutive failures in the browser! this is really bad",
];

// Libs

const os = require('os');
const fs = require('fs');
const readline = require('readline');
const { exec } = require('child_process');

// Init

global.keepRunning = true;

// Functions

async function getNextProxy()
{
	return new Promise
	(
		(resolve, reject) =>
		{
			const timeNow = new Date();
			const readStream = fs.createReadStream(proxy_list_file);
			const rl = readline.createInterface({
				input: readStream,
				output: process.stdout,
				terminal: false
			});
			var proxy_list = '';
			var nextProxy = null;
			var proxyCount = 0;
			
			rl.on
			(
				'line',
				(line) =>
				{
					var cLine = cleanString(line);

					if (cLine == '' || cLine.startsWith('#'))
					{
						proxy_list += line + '\n';
					}
					else
					{
						proxyCount++;
						
						var lineParts = cLine.split(',');
						var cooldownTime = 0;
						
						if (lineParts.length > 1)
						{
							var timestamp = parseInt('0' + cleanString(lineParts[1]));
							var lastUsedTime = new Date(timestamp * 1000);
							var cooldownTime = new Date(timestamp * 1000 + proxy_cooldown * 3600 * 1000);
						}
						
						if (nextProxy == null && timeNow > cooldownTime)
						{
							nextProxy = lineParts[0];
							proxy_list += lineParts[0] + ',' + (Math.floor(Date.now() / 1000)) + '\n';
						}
						else
						{
							proxy_list += line + '\n';
						}
					}
					
					if (!keepRunning) reject(null);
				}
			);

			rl.on
			(
				'close',
				() =>
				{
					readStream.close();
					
					if (nextProxy != null)
						fs.writeFile
						(
							proxy_list_file,
							proxy_list,
							(error) =>
							{
								if (error)
								{
									console.error('[ERROR] Could not update proxy list: ' + error);
									reject(error);
								}
								else
								{
									log('[INFO] Proxy list updated successfully. Next proxy: ' + nextProxy);
								}
							}
						);
					
					if (proxyCount == 0)
						log('[WARNING] No proxies available in proxy list!');
					else if (nextProxy == null)
						log('[WARNING] All proxies on cooldown!');
					
					resolve(nextProxy);
				}
			);
		}
	);
}

async function getNextProxyAvailability()
{
	return new Promise
	(
		(resolve, reject) =>
		{
			const readStream = fs.createReadStream(proxy_list_file);
			const rl = readline.createInterface({
				input: readStream,
				output: process.stdout,
				terminal: false
			});
			var proxyCount = 0;
			var nextProxyAvailability = null;
			
			rl.on
			(
				'line',
				(line) =>
				{
					var cLine = cleanString(line);

					if (cLine == '' || cLine.startsWith('#'))
					{
						// skip
					}
					else
					{
						proxyCount++;
						
						var lineParts = cLine.split(',');
						var cooldownTime = 0;
						
						if (lineParts.length > 1)
						{
							var timestamp = parseInt('0' + cleanString(lineParts[1]));
							
							if (nextProxyAvailability == null || nextProxyAvailability > timestamp)
								nextProxyAvailability = timestamp;
						}
						else
						{
							nextProxyAvailability = 0;
						}
					}
					
					if (!keepRunning) reject(null);
				}
			);

			rl.on
			(
				'close',
				() =>
				{
					readStream.close();
					
					if (proxyCount == 0)
						log('[WARNING] No proxies available in proxy list!');
					else if (nextProxyAvailability == null)
						log('[ERROR] Could not get next proxy availability!');
					
					if (nextProxyAvailability == 0) resolve(Math.floor(new Date().getTime() / 1000));
					else resolve(nextProxyAvailability + proxy_cooldown * 3600);
				}
			);
		}
	);
}

async function replaceProxy(ymlPath, newProxy)
{
	return new Promise
	(
		(resolve, reject) =>
		{
			const expandedPath = ymlPath.replace(/^~($|\/|\\)/, `${os.homedir()}$1`);
			const readStream = fs.createReadStream(expandedPath);
			const rl = readline.createInterface({
				input: readStream,
				output: process.stdout,
				terminal: false
			});

			const tempFilePath = expandedPath + '.tmp';
			const writeStream = fs.createWriteStream(tempFilePath);
			var lastProxy = null;

			rl.on
			(
				'line',
				(line) =>
				{
					var cLine = cleanString(line).toLowerCase();
					
					if (cLine.includes('https_proxy'))
					{
						var lineParts = line.split(':');
						lastProxy = cleanString(lineParts.slice(1).join(':'));
						writeStream.write(lineParts[0] + ': ' + newProxy + '\n');
					}
					else
					{
						writeStream.write(line + '\n');
					}
				}
			);

			rl.on
			(
				'close',
				() =>
				{
					readStream.close();
					writeStream.close();

					fs.rename
					(
						tempFilePath,
						expandedPath,
						(err) =>
						{
							if (err)
							{
								reject(err);
							}
							else
							{
								resolve(lastProxy);
							}
						}
					);
				}
			);
		}
	);
}

function cleanString(line)
{
	return line.replace(' ', '').replace('\t', '').replace('\r', '').replace('\n', '')
}

async function getDockerReplicas(ymlPath)
{
	return new Promise
	(
		(resolve, reject) =>
		{
			const expandedPath = ymlPath.replace(/^~($|\/|\\)/, `${os.homedir()}$1`);
			const readStream = fs.createReadStream(expandedPath);
			const rl = readline.createInterface({
				input: readStream,
				output: process.stdout,
				terminal: false
			});
			var numReplicas = 0;
			
			rl.on
			(
				'line',
				(line) =>
				{
					var cLine = cleanString(line).toLowerCase();
					
					if (cLine.includes('replicas'))
					{
						var lineParts = cLine.split(':');
						
						if (lineParts.length == 2)
							numReplicas = parseInt('0' + cleanString(lineParts[1]));
						else
							console.error('[ERROR] Replica line format mismatch(' + lineParts.length + ') in docker file: ' + line);
					}
					
					if (!keepRunning) reject(null);
				}
			);

			rl.on
			(
				'close',
				() =>
				{
					readStream.close();
					resolve(numReplicas);
				}
			);
		}
	);
}

function isContainerRunning(containerName)
{
    return new Promise
	(
		(resolve, reject) =>
		{
			exec
			(
				'docker ps --format "{{.Names}}"',
				(error, stdout, stderr) =>
				{
					if (error)
					{
						reject(error);
						return;
					}
					
					if (stderr)
					{
						reject(new Error(stderr));
						return;
					}
					
					const runningContainers = stdout.trim().split('\n');
					
					if (runningContainers.includes(containerName))
					{
						resolve(true);
					}
					else
					{
						resolve(false);
					}
				}
			);
		}
	);
}

function restartDockerContainer(ymlPath)
{
    return new Promise
	(
		(resolve, reject) =>
		{
			const expandedPath = ymlPath.replace(/^~($|\/|\\)/, `${os.homedir()}$1`);
			const command = 'docker-compose -f "' + expandedPath + '" down && docker-compose -f "' + expandedPath + '" up -d'
			exec
			(
				command,
				(error, stdout, stderr) =>
				{
					if (error)
					{
						reject(error);
						return;
					}
					
					if (stderr)
					{
						//reject(new Error(stderr));
						resolve(stdout + '\n' + stderr);
						return;
					}
					
					resolve(stdout);
				}
			);
		}
	);
}

function getDockerLogs(containerName)
{
    return new Promise
	(
		(resolve, reject) =>
		{
			const command = 'docker logs --since 5m ' + containerName;
			exec
			(
				command,
				(error, stdout, stderr) =>
				{
					if (error)
					{
						reject(error);
						return;
					}
					
					if (stderr)
					{
						//reject(new Error(stderr));
						resolve(stdout + '\n' + stderr);
						return;
					}
					
					resolve(stdout);
				}
			);
		}
	);
}

function wait(msec)
{
	return new Promise
	(
		(resolve) =>
		{
			setTimeout
			(
				() =>
				{
					resolve('resolved');
				}, msec
			);
		}
	);
}

// SIGINT handler

process.on('SIGINT', shutdown);

function shutdown()
{
	keepRunning = false;
	log('[INFO] Inited graceful shutdown.');
	wait(15000);
	process.exit();
}

function log(message)
{
	var now = new Date().toISOString();
	console.log(now + ' ' + message);
}

// Main

async function main()
{
	await log('[INFO] Startup.');
	await log('[INFO] Checking if Docker container is running...');
	
	await isContainerRunning(docker_worker_container_name.replace('[<WORKER_ID>]', 1))
		.then
		(
			(isRunning) =>
			{
				if (isRunning)
				{
					log('[INFO] The Docker container is running.');
				}
				else
				{
					log('[ERROR] The Docker container is not running. Exiting.');
					keepRunning = false;
				}
			}
		)
		.catch
		(
			(error) =>
			{
				console.error('[ERROR] Could not check if Docker container is running: ', error);
				keepRunning = false;
				throw error;
			}
		);
		
	// get number of replicas
	
	const replicaCount = await getDockerReplicas(docker_container_yml);
	
	if (replicaCount == 0)
	{
		await log('[ERROR] Could not find replica count definition. Exiting.');
		keepRunning = false;
	}
	
	// start main loop
	
	try
	{
		if (keepRunning)
			await log('[INFO] Starting docker/proxy check cycle.');
		
		while (keepRunning)
		{
			await log('[INFO] Checking docker logs of ' + replicaCount + ' replicas...');
			var hasLogs = false;
			var proxyBanned = false;
			
			replica_loop: for (var n = 1; n < replicaCount + 1; n++)
			{
				var containerName = docker_worker_container_name.replace('[<WORKER_ID>]', n);
				var dockerLogs = await getDockerLogs(containerName);
				
				if (cleanString(dockerLogs) == '')
				{
					//await log('[WARNING] Docker worker "' + containerName + '" had no logs in the past 5 minutes.');
				}
				else
				{
					hasLogs = true;
					
					for (var k = 0; k < docker_logs_check_phrases.length; k++)
						if (dockerLogs.includes(docker_logs_check_phrases[k]))
						{
							proxyBanned = true;
							break replica_loop;
						}
						
					//await log('[DEBUG INFO] ' + dockerLogs);
				}
			}
			
			if (proxyBanned)
			{
				await log('[INFO] There were JS checks not passing. Considering ban. Replacing proxy...');
				var nextProxy = await getNextProxy();
				
				if (nextProxy == null)
				{
					var nextProxyAvailable = await getNextProxyAvailability();
					var timestampNow = Math.floor(new Date().getTime() / 1000);
					var timeDiff = nextProxyAvailable - timestampNow;
					
					if (timeDiff > 0)
					{
						await log('[INFO] Next proxy available in ' + (timeDiff / 60).toFixed(1) + ' minutes. Sleeping...');
						await wait(timeDiff * 1000);
					}
				}
				else
				{
					var lastProxy = await replaceProxy(docker_container_yml, nextProxy);
					await log('[INFO] Replaced proxy "' + lastProxy + '" with "' + nextProxy + '". Restarting xilriws...');
					var restartOutput = await restartDockerContainer(docker_container_yml);
					//await log('[RESPONSE] ' + restartOutput);
				}
			}
			else if (!hasLogs)
			{
				await log('[WARNING] No Docker worker had logs in the past 5 minutes. Considering crash. Restarting containers...');
				var restartOutput = await restartDockerContainer(docker_container_yml);
				//await log('[RESPONSE] ' + restartOutput);
			}
			else
			{
				await log('[INFO] Logs look good.');
			}
			
			await log('[INFO] Sleeping for ' + check_cycle_time + ' minutes...');
			await wait(check_cycle_time * 60 * 1000);
		}
		
		await log('[INFO] Graceful shutdown. Bye.');
	}
	catch (error)
	{
		console.error(error);
		throw error;
	}
	finally
	{
		//
	}
}

main();