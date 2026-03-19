const https = require('https');

https.get('https://db.ygoprodeck.com/api/v7/cardinfo.php?language=ja', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const matches = json.data.filter(c => c.name.includes('スネークアイ'));
            console.log("MATCHES:", matches.length);
            console.log(matches.slice(0,5).map(c => c.name));
        } catch(e) {
            console.error(e);
        }
    });
});
