/**
 * Created by KK on 29/10/15.
 */

var fs = require('fs');
var _ = require('lodash');

var AlgorithmEnum = Object.freeze({
    BINARY: 0, // Binary Lookup
    PIHT: 1 // Pipelined Indexing Hash Table AKA Lookup on steroids
});

GEO_FIELD_MIN = 0;
GEO_FIELD_MAX = 1;
GEO_FIELD_COUNTRY = 2;

var Algorithm = AlgorithmEnum.PIHT;

exports.ip2long = function(ip) {
    ip = ip.split('.', 4);
    return parseInt(ip[0]) * 16777216 + parseInt(ip[1]) * 65536 + parseInt(ip[2]) * 256 + parseInt(ip[3]);
};

var buckets = [];
var bucketSize = 1;
var bitOffset = 0;
exports.load = function() {
    switch (Algorithm) {
        case AlgorithmEnum.PIHT:
            return loadPIHT();
            break;
        case AlgorithmEnum.BINARY:
            return loadBinary();
            break;
        default:
            return loadBinary();
            break;
    }
};
exports.lookup = function(ip) {
    var find, index;
    if (!ip) {
        return -1;
    }
    find = this.ip2long(ip);

    switch (Algorithm) {
        case AlgorithmEnum.PIHT:
            return lookupPIHT(find, ip);
            break;
        case AlgorithmEnum.BINARY:
            return lookupBinary(find);
            break;
        default:
            return lookupBinary(find);
            break;
    }
};

var loadPIHT = function() {
    var gindex = [];
    var data, i, len, line;
    data = fs.readFileSync(__dirname + "/../data/geo.txt", 'utf8');
    data = data.toString().split('\n');

    for (i = 0, len = data.length; i < len; i++) {
        line = data[i];
        if (!(line)) {
            continue;
        }
        line = line.split('\t');
        gindex.push({
            's': +line[0],
            'e': +line[1],
            'c': line[3]
        });
    }
    gindex = _.sortByOrder(gindex, ['s', 'e'], ['asc', 'asc']);

    var ls = gindex[0].s, // low start
        lb =  (ls >>> 0).toString(2), // low ip2long in binary
        ll = lb.length, // low binary digits count
        he = gindex[gindex.length-1].e, // high start
        hss = he >>> ll; // bucketSize


    bucketSize = hss > bucketSize ? hss : bucketSize;
    for (i = 0; i <= bucketSize; i++ ) {
        buckets.push([]);
    }

    bitOffset = ll > bitOffset ? ll : bitOffset;

    var bentry;
    var bucketIndex = 0;
    var bucketLow, bucketHigh;
    gindex = gindex.map(function (entry) {
        bentry = [entry.s, entry.e, entry.c];
        bucketIndex = (entry.s >>> bitOffset);
        bucketLow = ((entry.s >>> bitOffset) >>> bitOffset);
        bucketHigh = (((entry.s >>> bitOffset) + 1) >>> bitOffset);
        if (entry.s >= bucketLow && entry.e <= bucketHigh) { // in the middle
            buckets[bucketIndex].push(bentry);
        } else if ((entry.s < bucketLow) && (entry.e <= bucketHigh)) { // left
            if (bucketIndex > 0) {
                buckets[bucketIndex-1].push(bentry);
                buckets[bucketIndex].push(bentry);
            } else {
                buckets[0].push(bentry);
            }
        } else if ((entry.s >= bucketLow) && (entry.e > bucketHigh)) { // right
            if (bucketIndex >= bucketSize) {
                buckets[bucketIndex].push(bentry);
            } else {
                buckets[bucketIndex].push(bentry);
                buckets[bucketIndex+1].push(bentry);
            }
        } else { // overlap this is very rare
            if ( (bucketIndex > 0) && (bucketIndex < bucketSize)) {
                buckets[bucketIndex -1].push(bentry);
                buckets[bucketIndex].push(bentry);
                buckets[bucketIndex +1].push(bentry);
            } else if (bucketIndex <= 0) {
                buckets[bucketIndex].push(bentry);
                buckets[bucketIndex +1].push(bentry);
            } else if (bucketIndex >= bucketSize) {
                buckets[bucketIndex -1].push(bentry);
                buckets[bucketIndex].push(bentry);
            } else {
                buckets[bucketIndex].push(bentry);
            }
        }
        return bentry;
    });
};


var normalize = function(row) {
    return {
        country: row[GEO_FIELD_COUNTRY]
    };
};
var lookupPIHT = function(find, ip) {
    var gindex = [];
    var index = (find >>> (bitOffset));
    if (index > bucketSize || index < 0) {
        index = bucketSize;
    }
    gindex = buckets[index];
    var bottom = 0;
    var top = gindex.length-1;
    var mid = 0;
    do { // Binary Search the bucket
        mid = Math.floor((bottom+top)/2);
        if (find > gindex[mid][GEO_FIELD_MAX]) {
            bottom = mid + 1;
        } else {
            top = mid - 1;
        }
    } while (!(find >= gindex[mid][GEO_FIELD_MIN] && find <= gindex[mid][GEO_FIELD_MAX]) && (top >= bottom));
    if (find >= gindex[mid][GEO_FIELD_MIN] && find <= gindex[mid][GEO_FIELD_MAX]) {
        return normalize(gindex[mid]);
    } else {
        return null;
    }
};


var loadBinary = function() {
    var gindex = [];
    var data, i, len, line;
    data = fs.readFileSync(__dirname + "/../data/geo.txt", 'utf8');
    data = data.toString().split('\n');

    for (i = 0, len = data.length; i < len; i++) {
        line = data[i];
        if (!(line)) {
            continue;
        }
        line = line.split('\t');
        gindex.push({
            's': +line[0],
            'e': +line[1],
            'c': line[3]
        });
    }
    gindex = _.sortByOrder(gindex, ['s', 'e'], ['asc', 'asc']);
    var bentry;
    gindex = gindex.map(function (entry) {
        bentry = [entry.s, entry.e, entry.c];
        return bentry;
    });
    buckets[0] = gindex;
    bucketSize = 1;
    bitOffset = 0;
};

var lookupBinary = function(find) {
    var gindex = buckets[0];
    var bottom = 0;
    var top = gindex.length-1;
    var mid = 0;
    do { // Binary Search
        mid = Math.floor((bottom+top)/2);
        if (find > gindex[mid][GEO_FIELD_MAX]) {
            bottom = mid + 1;
        } else {
            top = mid - 1;
        }
    } while (!(find >= gindex[mid][GEO_FIELD_MIN] && find <= gindex[mid][GEO_FIELD_MAX]) && (top >= bottom));
    if (find >= gindex[mid][GEO_FIELD_MIN] && find <= gindex[mid][GEO_FIELD_MAX]) {
        return normalize(gindex[mid]);
    } else {
        return null;
    }
};

