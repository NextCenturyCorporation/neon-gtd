function TweeterHistory(cfg) {
    "use strict";

    var data = {
        indexMode: "source",
        stickyCount: 0,
        sticky: false,
        senderIndexed: true,
        records: {},
        maxHistoryLength: Infinity,
        historyLength: 15,
        time: 0
    };

    cfg = cfg || {};
    data.indexMode = cfg.indexMode || "source";
    if (data.indexMode !== "source" && data.indexMode !== "target") {
        throw new Error("illegal index mode: " + data.indexMode);
    }

    return {
        setMaxHistoryLength: function (val) {
            data.maxHistoryLength = val;
        },

        setHistoryLength: function (val) {
            data.historyLength = val;
        },

        addRecord: function (rec) {
            var index = rec[data.indexMode];

            if (!data.records.hasOwnProperty(index)) {
                data.records[index] = {
                    tweeter: index,
                    quantity: 1,
                    time: data.time
                };
            } else {
                data.records[index].quantity++;
            }
        },

        getHistory: function () {
            var records = _.values(data.records);
            records.sort(function (a, b) {
                return b.quantity - a.quantity;
            });

            return records.slice(0, data.historyLength);
        },

        cycle: function () {
            data.time++;
            _.forOwn(data.records, function (record, index, records) {
                if (record.time > data.maxHistoryLength) {
                    delete records[index];
                }
            });
        },

        reset: function () {
            data.time = 0;
            data.records = {};
        }
    };
}
