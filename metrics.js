/**
 * Collection of metrics and their associated SQL requests
 */
const debug = require("debug")("metrics");
const client = require('prom-client');

// UP metric
const up = new client.Gauge({name: 'up', help: "UP Status"});

// Query based metrics
// -------------------
const mssql_instance_local_time = {
    metrics: {
        mssql_instance_local_time: new client.Gauge({name: 'mssql_instance_local_time', help: 'Number of seconds since epoch on local instance'})
    },
    query: `SELECT DATEDIFF(second, '19700101', GETUTCDATE())`,
    collect: function (rows, metrics) {
        const mssql_instance_local_time = rows[0][0].value;
        debug("Fetch current time", mssql_instance_local_time);
        metrics.mssql_instance_local_time.set(mssql_instance_local_time);
    }
};

const mssql_connections = {
    metrics: {
        mssql_connections: new client.Gauge({name: 'mssql_connections', help: 'Number of active connections', labelNames: ['database', 'state',]})
    },
    query: `SELECT DB_NAME(sP.dbid)
        , COUNT(sP.spid)
FROM sys.sysprocesses sP
GROUP BY DB_NAME(sP.dbid)`,
    collect: function (rows, metrics) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const database = row[0].value;
            const mssql_connections = row[1].value;
            debug("Fetch number of connections for database", database, mssql_connections);
            metrics.mssql_connections.set({database: database, state: 'current'}, mssql_connections);
        }
    }
};

const mssql_io_stall = {
    metrics: {
        mssql_io_stall: new client.Gauge({name: 'mssql_io_stall', help: 'Wait time (ms) of stall since last restart', labelNames: ['database', 'type']}),
        mssql_io_stall_total: new client.Gauge({name: 'mssql_io_stall_total', help: 'Wait time (ms) of stall since last restart', labelNames: ['database']}),
    },
    query: `SELECT
cast(DB_Name(a.database_id) as varchar) as name,
    max(io_stall_read_ms),
    max(io_stall_write_ms),
    max(io_stall),
    max(io_stall_queued_read_ms),
    max(io_stall_queued_write_ms)
FROM
sys.dm_io_virtual_file_stats(null, null) a
INNER JOIN sys.master_files b ON a.database_id = b.database_id and a.file_id = b.file_id
group by a.database_id`,
    collect: function (rows, metrics) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const database = row[0].value;
            const read = row[1].value;
            const write = row[2].value;
            const stall = row[3].value;
            const queued_read = row[4].value;
            const queued_write = row[5].value;
            debug("Fetch number of stalls for database", database);
            metrics.mssql_io_stall_total.set({database: database}, stall);
            metrics.mssql_io_stall.set({database: database, type: "read"}, read);
            metrics.mssql_io_stall.set({database: database, type: "write"}, write);
            metrics.mssql_io_stall.set({database: database, type: "queued_read"}, queued_read);
            metrics.mssql_io_stall.set({database: database, type: "queued_write"}, queued_write);
        }
    }
};


const metrics = [
    mssql_instance_local_time,
    mssql_connections,
    mssql_io_stall,
];

module.exports = {
    client: client,
    up: up,
    metrics: metrics,
};

// DOCUMENTATION of queries and their associated metrics (targeted to DBAs)
if (require.main === module) {
    metrics.forEach(function (m) {
        for(let key in m.metrics) {
            if(m.metrics.hasOwnProperty(key)) {
                console.log("--", m.metrics[key].name, m.metrics[key].help);
            }
        }
        console.log(m.query + ";");
        console.log("");
    });

    console.log("/*");
    metrics.forEach(function (m) {
        for (let key in m.metrics) {
            if(m.metrics.hasOwnProperty(key)) {
                console.log("* ", m.metrics[key].name + (m.metrics[key].labelNames.length > 0 ? ( "{" + m.metrics[key].labelNames + "}") : ""), m.metrics[key].help);
            }
        }
    });
    console.log("*/");
}