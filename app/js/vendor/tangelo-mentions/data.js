/*jshint browser: true */
/*global _, twitter, $, neon */

function updateRecorders(response) {
    "use strict";

    _.each(response.tweeters, function (r) {
        twitter.sourceRecorder.addRecord(r);
        twitter.targetRecorder.addRecord(r);
    });

    response.history = twitter.sourceRecorder.getHistory();
    response.targetHistory = twitter.targetRecorder.getHistory();

    twitter.sourceRecorder.cycle();
    twitter.targetRecorder.cycle();
}

function tweetersTangelo(host, database, collection, params, callback) {
    "use strict";

    $.ajax({
        url: "service/tweeters/" + host + "/" + database + "/" + collection,
        data: params,
        dataType: "json",
        success: function (response) {
            updateRecorders(response);
            callback(response);
        }
    });
}

function neonQuery(start_time, end_time, current_talkers) {
    "use strict";

    var where = neon.query.where,
        and = neon.query.and,
        or = neon.query.or;

    return new neon.query.Query()
        .selectFrom(twitter.mentionsDatabase, twitter.mentionsCollection)
        .where(and(where("date", ">=", start_time),
                         where("date", "<", end_time),
                         where("source", "!=", ""),
                         where("target", "!=", ""),
                         or(where("source", "in", current_talkers),
                            where("target", "in", current_talkers))));
}

function tweetersNeon(host, database, collection, params, callback) {
    "use strict";

    var missing = [],
        talkers,
        current_talkers,
        all_results,
        tweeters,
        hop,
        distance,
        response;

    params = params || {};

    _.each(["start_time", "end_time", "center", "degree"], function (arg) {
        if (_.isUndefined(params[arg])) {
            missing.push(arg);
        }
    });

    if (missing.length > 0) {
        throw new Error("missing required argument" + (missing.length > 1 ? "s" : "") + ": " + missing.join(", "));
    }

    params.start_time = new Date(params.start_time);
    params.end_time = new Date(params.end_time);

    talkers = {};
    talkers[params.center] = true;

    distance = {};
    distance[params.center] = 0;

    current_talkers = _.keys(talkers);
    all_results = [];
    tweeters = [];
    response = {
        tweeters: []
    };

    hop = function (level) {
        var edges,
            nodes,
            talker_index;

        if (level === 0) {
            edges = [];

            talker_index = {};
            // _.each(response.tweeters, function (t, i) {
            _.each(_.keys(talkers), function (t, i) {
                talker_index[t] = i;
            });
            _.each(response.tweeters, function (t) {
                edges.push({
                    source: talker_index[t.source],
                    target: talker_index[t.target],
                    id: t._id
                });
            });

            nodes = _.map(talkers, function (_, t) {
                return {
                    tweet: t,
                    distance: distance[t]
                };
            });

            response.result = {
                nodes: nodes,
                edges: edges
            };

            updateRecorders(response);
            callback(response);
        } else {
            var query = neonQuery(params.start_time, params.end_time, current_talkers);
            twitter.neon.connection.executeQuery(query, function (result) {
                var tweets = result.data;

                response.tweeters = response.tweeters.concat(tweets);

                current_talkers = _.pluck(tweets, "target").concat(_.pluck(tweets, "source"));
                _.each(current_talkers, function (talker) {
                    talkers[talker] = true;
                    if (!distance.hasOwnProperty(talker)) {
                        distance[talker] = params.degree - level + 1;
                    }
                });

                hop(level - 1);
            });
        }
    };

    hop(params.degree);
}

function tweeters(cfg) {
    "use strict";

    cfg = cfg || {};

    switch (cfg.backend) {
        case "tangelo": {
            tweetersTangelo(cfg.host, cfg.database, cfg.collection, cfg.params, cfg.callback || $.noop);
            break;
        }

        case "neon": {
            tweetersNeon(cfg.host, cfg.database, cfg.collection, cfg.params, cfg.callback || $.noop);
            break;
        }

        default: {
            throw new Error("illegal backend: '" + cfg.backend + "'");
        }
    }
}
