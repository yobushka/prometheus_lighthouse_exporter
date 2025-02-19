#!/usr/bin/env node

'use strict';

import http from 'http';
import url from 'url';
import puppeteer from 'puppeteer';
import lighthouse from 'lighthouse';
import minimist from 'minimist';
import {Mutex, Semaphore, withTimeout} from 'async-mutex';

var argv = minimist(process.argv.slice(2));

var port = 9593;

if('p' in argv){
    port = argv.p;
}

const mutex = new Mutex();

http.createServer(async (req, res) => {
    const release = await mutex.acquire();

    var q = url.parse(req.url, true);

    if(q.pathname == '/probe'){
        var target = q.query.target;
	var mode = 'mobile';
	var tag = 'no';

        const parser = url.parse(target);
	var uri = parser.pathname

        if (q.query.mode) {
	    if (q.query.mode == 'mobile') {
            mode = 'mobile'
            }
	    if (q.query.mode == 'desktop') {
            mode = 'desktop'
            }
        }

        if (q.query.tag) {
            tag = q.query.tag
        }


        var data = [];

        try{
	    const browser = await puppeteer.launch({
              headless: 'new',
              args: ['--no-sandbox', '--disable-setuid-sandbox'],
              dumpio: false
            });

            data.push('# HELP lighthouse_exporter_info Exporter Info');
            data.push('# TYPE lighthouse_exporter_info gauge');
            data.push(`lighthouse_exporter_info{version="0.2.9",chrome_version="${await browser.version()}",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}",node_version="${process.version}"} 1`);

            await lighthouse(target, {
                port: url.parse(browser.wsEndpoint()).port,
                preset: '${mode}',
                output: 'json'
            })
                .then(results => {
                    data.push('# HELP lighthouse_score The Score per Category');
                    data.push('# TYPE lighthouse_score gauge');

                    for(var category in results.lhr.categories){
                        var item = results.lhr.categories[category];

                        data.push(`lighthouse_score{category="${category}",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${item.score * 100}`);
                    }

                    var audits = results.lhr.audits;

                    data.push('# HELP lighthouse_timings Audit timings in ms');
                    data.push('# TYPE lighthouse_timings gauge');

                    data.push(`lighthouse_timings{audit="first-contentful-paint",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${Math.round(audits["first-contentful-paint"].numericValue)}`);
                    data.push(`lighthouse_timings{audit="first-meaningful-paint",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${Math.round(audits["first-meaningful-paint"].numericValue)}`);
                    data.push(`lighthouse_timings{audit="speed-index",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${Math.round(audits["speed-index"].numericValue)}`);
                    data.push(`lighthouse_timings{audit="interactive",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${Math.round(audits["interactive"].numericValue)}`);
                    data.push(`lighthouse_timings{audit="total-blocking-time",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${Math.round(audits["total-blocking-time"].numericValue)}`);
                    data.push(`lighthouse_timings{audit="max-potential-fid",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${Math.round(audits["max-potential-fid"].numericValue)}`);
                    data.push(`lighthouse_timings{audit="server-response-time",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${Math.round(audits["server-response-time"].numericValue)}`);
                    data.push(`lighthouse_timings{audit="bootup-time",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${Math.round(audits["bootup-time"].numericValue)}`);
                    data.push(`lighthouse_timings{audit="largest-contentful-paint",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${Math.round(audits["largest-contentful-paint"].numericValue)}`);
                    data.push(`lighthouse_timings{audit="cumulative-layout-shift",mode="${mode}",tag="${tag}",host="${parser.hostname}",uri="${uri}"} ${Math.round(audits["cumulative-layout-shift"].numericValue)}`);
                })
                .catch(error => {
                    console.error("Lighthouse", Date(), error);
                });

            await browser.close();
        } catch(error) {
            console.error("Generic", Date(), error);
        }

        res.writeHead(200, {"Content-Type": "text/plain"});
        res.write(data.join("\n"));
    } else{
        res.writeHead(404);
    }

    release();

    res.end();
}).listen(port);
