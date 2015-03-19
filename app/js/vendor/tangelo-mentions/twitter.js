/*jslint browser:true, unparam:true */
/*globals $, console, d3, tweeters, neon, TweeterHistory, vg */

var color = null;
var force = null;
var graph = null;
var svg = null;
var width = 0;
var height = 0;
var transition_time;
var translate = [0, 0];

var twitter = {};
twitter.startDate = null;
twitter.endDate = null;
twitter.center = null;
twitter.degree = null;
twitter.history_length = null;
twitter.host = null;
twitter.textmode = true;
twitter.lastResponseLength = 0;

//should user click of node make this node the new center?
twitter.clickCausesFollow = false;

twitter.dayColor = d3.scale.category10();
twitter.monthColor = d3.scale.category20();

twitter.dayName = d3.time.format("%a");
twitter.monthName = d3.time.format("%b");
twitter.dateformat = d3.time.format("%a %b %e, %Y (%H:%M:%S)");

// add globals for current collections to use.  Allows collection to be initialized at
// startup time from a defaults.json file. This app reads from the mentions collection and
// creates history records in the history collections.  Often the databases will be different
// so the history records don't crowd the database where the source data is located.

twitter.mentionsDatabase= null;
twitter.mentionsCollection = null;
twitter.historyDatabase = null;
twitter.senderHistoryCollection = null;
twitter.targetHistoryCollection = null;

// initial starting search conditions are initialized from defaults.json if it is present (see line 470)
twitter.centralEntity = null;
twitter.initialStartDate = null;
twitter.initialEndDate = null;

twitter.monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
];

twitter.dayNames = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat"
];

// make alternating blue and tan colors gradually fading to background to add color gradient to network
// see http://en.wikipedia.org/wiki/Web_colors
twitter.nodeColorArray = [
        "#ff2f0e","#1f77b4","#cd853f","#1e90b4", "#f5deb3","#add8e6","#fff8dc",
        "#b0e0e6","#faf0e6","#e0ffff","#fff5e0","#f0fff0"
];

function stringifyDate(d) {
    "use strict";

    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function displayDate(d) {
    "use strict";

    return twitter.monthNames[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}

function updateGraph() {
    "use strict";

    var center,
        data,
        end_date,
        hops,
        change_button,
        start_date,
        update;

    update = d3.select("#update");
    change_button = !update.attr("disabled");

    if (change_button) {
        update.attr("disabled", true)
            .text("Updating...");
    }

    // Get JavaScript Date objects for the start and end dates.
    start_date = twitter.startDate.datepicker("getDate").getTime();
    end_date = twitter.endDate.datepicker("getDate").getTime();

    center = twitter.center.val();

    hops = twitter.degree.spinner("value");

    data = {
/*        start_time: stringifyDate(start_date),*/
        /*end_time: stringifyDate(end_date),*/
        start_time: (start_date),
        end_time: (end_date),
        center: center,
        degree: hops
    };
    var logText = "query clause: start="+data.start_time+" center="+center+" degree="+hops;

    tweeters({
        backend: twitter.backend,
        host: twitter.host,
        database: twitter.mentionsDatabase,
        collection: twitter.mentionsCollection,
        params: data,
        callback: function (response) {
            var angle,
                enter,
                link,
                map,
                newidx,
                node,
                tau;

            if (change_button) {
                d3.select("#update")
                    .attr("disabled", null)
                    .text("Update");
            }

            if (response.error || response.result.length === 0) {
                //console.log("error: " + response.error);
                return;
            }

            // save the length of the response to use it to slow animation down
            // when the graph is large
            twitter.lastResponseLength = response.result.nodes.length;
            //console.log('data returned:',response.result)
            //console.log('length returned:',response.result.nodes.length)

            // Save the last iteration of node data, so we can transfer the
            // positions to the new iteration.
            map = {};
            $.each(force.nodes(), function (i, v) {
                map[v.tweet] = v;
            });

            graph = response.result;
            newidx = [];
            $.each(graph.nodes, function (i, v) {
                if (map.hasOwnProperty(v.tweet)) {
                    graph.nodes[i].x = map[v.tweet].x;
                    graph.nodes[i].y = map[v.tweet].y;
                } else {
                    newidx.push(i);
                }
            });

            // CRL - moved to 1/4 into screen instead of 1/2
            tau = 2 * Math.PI;
            angle = tau / newidx.length;
            $.each(newidx, function (i, v) {
                graph.nodes[i].x = (width / 2) * Math.cos(i * angle) + (width / 2);
                graph.nodes[i].y = (height / 2) * Math.sin(i * angle) + (height / 2);
            });

            transition_time = 600;

            link = svg.select("g#links")
                .selectAll(".link")
                .data(graph.edges, function (d) {
                    return d.id;
                });

            link.enter().append("line")
                .classed("link", true)
                .style("opacity", 0.0)
                .style("stroke-width", 0.0)
                .transition()
                .duration(transition_time)
                .style("opacity", 0.6)
                .style("stroke","grey")
                .style("stroke-width", 1.0);

            link.exit()
                .transition()
                .duration(transition_time)
                .style("opacity", 0.0)
                .style("stroke-width", 0.0)
                .remove();

            node = svg.select("g#nodes")
                .selectAll(".node")
                .data(graph.nodes, function (d) {
                    return d.tweet;
                });

            // the user may want to force re-centering on the graph by clicking a new center
            // directly.  Add this callback to always fire, then the method only takes action if
            // the "following" mode is set. 
    /**
            var node2 = svg.select("g#nodes")
                .selectAll(".node")
                .data(graph.nodes, function (d) { return d.tweet; })
                .enter()
                .on("click", function(d) {
                        console.log('click was heard')
                        centerOnClickedGraphNode(d.tweet)
                });

    **/

            // support two different modes, where circular nodes are drawn for each entity or for where the
            // sender name is used inside a textbox. if twitter.textmode = true, then render text

            if (!twitter.textmode) {
                enter = node.enter().append("circle")
                    .classed("node", true)
                    .attr("r", 5)
                    .style("opacity", 0.0)
                    .style("fill", "red")
                    .on("click", function (d) {
                        centerOnClickedGraphNode(d.tweet);
                    });

                enter.transition()
                    .duration(transition_time)
                    .attr("r", 12)
                    .style("opacity", 1.0)
                    .style("fill", function (d) {
                        return color(d.distance);
                    });

                enter.call(force.drag)
                    .append("title")
                    .text(function (d) {
                        return d.tweet || "(no username)";
                    });

                node.exit()
                    .transition()
                    .duration(transition_time)
                    .style("opacity", 0.0)
                    .attr("r", 0.0)
                    .style("fill", "black")
                    .remove();

                force.nodes(graph.nodes)
                    .links(graph.edges)
                    .start();

                force.on("tick", function () {
                    link
                        .attr("x1", function (d) {
                            return d.source.x;
                        })
                        .attr("y1", function (d) {
                            return d.source.y;
                        })
                        .attr("x2", function (d) {
                            return d.target.x;
                        })
                        .attr("y2", function (d) {
                            return d.target.y;
                        });

                    node
                        .attr("cx", function (d) {
                            return d.x;
                        })
                        .attr("cy", function (d) {
                            return d.y;
                        });
                });
            } else {
                enter = node.enter()
                    .append("g")
                    .classed("node", true);

                enter.append("text")
                    .text(function (d) {
                        return d.tweet;
                    })

                    // use the default cursor so the text doesn't look editable
                    .style('cursor', 'default')

                    // enable click to recenter
                    .on("click", function (d) {
                        centerOnClickedGraphNode(d.tweet);
                    })

                    .datum(function (d) {
                        // Adjoin the bounding box to the element's bound data.
                        d.bbox = this.getBBox();
                        return d;
                    });

                enter.insert("rect", ":first-child")
                    .attr("width", function (d) {
                        return d.bbox.width + 4;
                    })
                    .attr("height", function (d) {
                        return d.bbox.height + 4;
                    })
                    .attr("y", function (d) {
                        return d.bbox.y - 2;
                    })
                    .attr("x", function (d) {
                        return d.bbox.x - 2;
                    })
                    .attr('rx', 4)
                    .attr('ry', 4)
                    .style("stroke", function (d) {
                        return color(d.distance);
                    })
                    .style("stroke-width", "2px")
                    .style("fill", "#e5e5e5")
                    .style("fill-opacity", 0.8);

                force.on("tick", function () {
                    link.attr("x1", function (d) {
                        return d.source.x;
                    })
                        .attr("y1", function (d) {
                            return d.source.y;
                        })
                        .attr("x2", function (d) {
                            return d.target.x;
                        })
                        .attr("y2", function (d) {
                            return d.target.y;
                        });

                    node.attr("transform", function (d) {
                        return "translate(" + d.x + ", " + d.y + ")";
                    });
                });
                force.linkDistance(100);
            }
            force.nodes(graph.nodes)
                .links(graph.edges)
                .start();

           // draw history graph
            drawHistoryChart(response.history,"#historychart1");
            drawHistoryChart(response.targetHistory,"#historychart2");

            enter.call(force.drag);

            node.exit()
                .transition()
                .duration(transition_time)
                .style("opacity", 0.0)
                .attr("r", 0.0)
                .style("fill", "black")
                .remove();
        }
    });

    // Create a NEON filter on the main twitter table for the center of the graph.
    filterNeonTableOnUser(center);
}

function advanceTimer() {
    "use strict";

    var advance;

    advance = new Date(twitter.startDate.datepicker("getDate").getTime() + 86400e3);
    twitter.startDate.datepicker("setDate", advance);

    advance = new Date(twitter.endDate.datepicker("getDate").getTime() + 86400e3);
    twitter.endDate.datepicker("setDate", advance);

    updateGraph();
}

var timeout = null;
function toggleAnimation() {
    "use strict";

    var anim, update;
    var graphAdjustTime, baseDelayTime;
    // log action

    anim = d3.select("#animate");
    update = d3.select("#update");

    if (anim.text() === "Animate") {
        anim.text("Stop animation")
            .classed("btn-success", false)
            .classed("btn-warning", true);
        update.attr("disabled", true);

        // slowed down the animation from 1.5x to 5.0x  and adding a component to delay for larger graphs
        baseDelayTime = transition_time *5.0;
        graphAdjustTime = (twitter.lastResponseLength * 20);
        if (isNaN(graphAdjustTime)) {
            graphAdjustTime = 0;
        }
        //console.log(graphAdjustTime)

        timeout = setInterval(advanceTimer, parseInt(baseDelayTime + graphAdjustTime));
    } else {
        anim.text("Animate")
            .classed("btn-success", true)
            .classed("brn-warning", false);
        update.attr("disabled", null);

        clearInterval(timeout);
    }
}

function twitterDistanceFunction( distance) {
    "use strict";

    // make alternating blue and tan colors gradually fading to background to
    // add color gradient to network see http://en.wikipedia.org/wiki/Web_colors

    // for really far away distances, wrap the colors, avoid the red at the center.  This allows this algorithm to always
    // produce a cycle of acceptable colors
    if (distance > twitter.nodeColorArray.length-1) {
        return twitter.nodeColorArray[(distance%(twitter.nodeColorArray.length-1))+1];
    } else {
        return twitter.nodeColorArray[distance];
    }
}

function firstTimeInitialize() {
    "use strict";

    d3.json("js/vendor/tangelo-mentions/defaults.json", function (err, defaults) {
        defaults = defaults || {};

        // read default data collection names from config file
        twitter.host = defaults.mongoHost || "localhost";
        twitter.mentionsCollection = defaults.mentionsCollection || "twitter_mentions_sa";
        twitter.mentionsDatabase = defaults.mentionsDatabase || "year2";
        twitter.centralEntity = defaults.centralEntity || "fehrnheit";
        twitter.initialStartDate = defaults.startDate || "February 11, 2015";
        twitter.initialEndDate = defaults.endDate || "February 12, 2015";
        twitter.backend = defaults.backend || "tangelo";
        console.log('set mentions collection: ',twitter.mentionsCollection);
        console.log('set start date:',twitter.initialStartDate);

        initializeNeon();

        // make the panel open & close over data content
        $('#control-panel').controlPanel({
            height: defaults.controlPanelHeight || "500px"
        });

        width = $(window).width();
        height = $(window).height();

        svg = d3.select("svg")
            .attr('width', width)
            .attr('height', height);

        svg.select('rect#overlay')
            .attr('x', -1000)
            .attr('y', -1000)
            .attr('width', $(window).width() + 1000)
            .attr('height', $(window).height() + 1000)
            .style('fill-opacity', 1e-6)
            .style('cursor', 'move')
            .on('mousedown', function () {
                var windowrect = d3.select('body')
                        .append('svg')
                            .attr('width', width)
                            .attr('height', height)
                            .style('position', 'absolute')
                            .style('left', 0)
                            .style('top', 0)
                            .attr('id', 'overlay-rectangle')
                        .append('rect')
                            .attr('width', width)
                            .attr('height', height)
                            .style('fill-opacity', 1e-6)
                            .style('cursor', 'move'),
                    dragging=d3.mouse(windowrect.node());
                windowrect
                    .on('mouseup.forcemap', function () {
                        dragging=false;
                        d3.select('svg#overlay-rectangle').remove();
                    })
                    .on('mousemove.forcemap', function () {
                        var position;
                        if (dragging) {
                            position = d3.mouse(windowrect.node());
                            translate[0] += position[0] - dragging[0];
                            translate[1] += position[1] - dragging[1];
                            dragging = position;
                            svg.attr('transform', 'translate(' + translate.join() + ')');
                        }
                    })
                    .on('mouseout.forcemap', function () {
                        dragging=false;
                        d3.select('svg#overlay-rectangle').remove();
                    });
            });

        svg = svg.select('#transform-group')
            .attr('transform', 'translate(' + translate.join() + ')');
        // 3/2014: changed link strength down from charge(-500), link(100) to charge(-2000)
        // to reduce the node overlap but still allow some node wandering animation without being too stiff

        // 6/2014: divided width/2 to move to left side and leave room for history charts

        force = d3.layout.force()
            .charge(-2000)
            .linkDistance(75)
            .gravity(0.2)
            .friction(0.6)
            .size([width, height]);

        //color = d3.scale.category20();
        color = twitterDistanceFunction;

        // Activate the jquery controls.
        twitter.startDate = $("#start-date");
        twitter.endDate = $("#end-date");
        twitter.center = $("#center");
        twitter.degree = $("#degree");
        twitter.history_length = $("#history_length");
        twitter.history_storage_length = $("#history_storage_length");

        twitter.startDate.datepicker({
            allowPastDates: true,
            date: twitter.initialStartDate
        });

        twitter.endDate.datepicker({
            allowPastDates: true,
            date: twitter.initialEndDate
        });

        //twitter.center.val("rashidalfowzan")
        twitter.center.val(twitter.centralEntity);

        // clamp to 2 for South American dataset
        twitter.degree.spinner({
            min: 1,
            max: 2
        });
        twitter.degree.spinner("value", 1);

        // ---- setup controls for the history ------

        // define a slider that controls the length of the history records to
        // display.  An ajax call is made whenever the slider value is changed
        // to update the logic in the python service that returns data for Vega
        // rendering.

        twitter.history_length.slider({
            min: 10,
            max: 50,
            value: 35,
            slide: function (evt, ui) {
                d3.select("#history_length-label")
                    .text('show top '+ui.value+ ' tweeters');
            },
            change: function (evt, ui) {
                d3.select("history_length_label")
                    .text(ui.value);
                updateHistoryLength();
            }
        });
        twitter.history_length.slider("value", twitter.history_length.slider("value"));

        twitter.history_storage_length.slider({
            min: 10,
            max: 100,
            value: 75,
            slide: function (evt, ui) {
                d3.select("#history_storage_length-label")
                    .text('keep history for '+ui.value+ ' iterations');
            },
            change: function (evt, ui) {
                d3.select("history_storage_length_label")
                    .text(ui.value);
                updateHistoryStorageLength();
            }
        });
        twitter.history_storage_length.slider("value", twitter.history_storage_length.slider("value"));

        d3.select("#update-history")
            .on("click", updateGraph);

// --- end of history panel additions

        d3.select("#update")
            .on("click", updateGraph);

        d3.select("#animate")
            .on("click", toggleAnimation);

        d3.select("#clearSend")
            .on("click", clearHistoryCallback);

        // respond to the text label button being clicked
        d3.select("#usetext")
            .on("click", function () {
                d3.select("#nodes")
                    .selectAll("*")
                    .remove();

                d3.select("#links")
                    .selectAll("*")
                    .remove();

                twitter.textmode = !twitter.textmode;
                updateGraph(true);
            });

        // respond to the allow click to cause follow operation being clicked
        d3.select("#clickfollow")
            .on("click", function () {
                twitter.clickCausesFollow = !twitter.clickCausesFollow;
                //console.log("clickfollow=",twitter.clickCausesFollow);

                // reload the graph with nodes that have or don't have events attached on them
                updateGraph();
            });

        // block the contextmenu from coming up (often attached to right
        // clicks). Since many of the right clicks will be on the graph, this
        // has to be at the document level so newly added graph nodes are all
        // covered by this handler.

        $(document).bind('contextmenu', function (e) {
            e.preventDefault();
            return false;
        });

        updateGraph();
    });
}

// this method is called when a user clicks on a node in the graph.  There is a
// mode where the user has elected to re-center around clicked nodes, and this
// can be enabled/disabled through a UI checkbox, so examine the state variable
// to decide if any action should be taken. This method is always called because
// callbacks are alwayw placed on the nodes.

function filterNeonTableOnUser(item) {
    console.log("filtering on " + item);
    // twitter.neon = new neon.query.Connection();
    // twitter.neon.connect(neon.query.Connection.MONGO, twitter.host);
    // twitter.neon.use(twitter.mentionsDatabase);

    if(twitter.neon && twitter.neon.messenger) {
        if (item) {
            var filterClause = neon.query.where('user', '=', item);
            var filter = new neon.query.Filter().selectFrom('year2', 'twitter_sa_small').where(filterClause);
            twitter.neon.messenger.replaceFilter('tangelo-mentions-filter-key', filter, function() {
                console.log("Mentions: neon filter set on " + item);
            });
        }
        else {
            twitter.neon.messenger.removeFilter('tangelo-mentions-filter-key', function() {
                console.log("Mentions: neon filter removed");
            })
        }
    }
}

function centerOnClickedGraphNode(item) {
    "use strict";

    if (twitter.clickCausesFollow) {
        console.log("centering on:",item);
        // assign the new center of the mentions graph
        twitter.center.val(item);

        // remove the previous graph
        d3.select("#nodes").selectAll("*").remove();
        d3.select("#links").selectAll("*").remove();
        // draw the new graph
        updateGraph();
    }
}

// ----------------- Vega history chart ---------------------------------------

// global values are updated during each rendering step
var rowdata;
var indexlist;
var minarray;
var maxarray;

function centerOnClickedHistoryRecord(item) {
    "use strict";

    //console.log("centering on:",item.text)

    // assign the new center of the mentions graph
    twitter.center.val(item.text);
    // remove the previous graph
    d3.select("#nodes").selectAll("*").remove();
    d3.select("#links").selectAll("*").remove();
    // draw the new graph
    updateGraph(true);
}

// bind data  with the vega spec.  We are also catching the mouse enter and
// mouse exit events on the vega elements in order to generate instrumentation
// for the logging API.  The way the spec is currently defined, there are
// rectangles and their are labels.  They are cousins, but we aren't sure how,
// so the mouse events tests if the text attribute is defined in order to only
// log events against the labels for now.

function parseVegaSpec(spec, dynamicData, elem) {
    "use strict";

    //console.log("parsing vega spec");
    vg.parse.spec(spec, function (chart) {
        var vegaview = chart({
            el: elem,
            data: {rows: dynamicData.rowdata, index: dynamicData.indexlist}
        })
        .on("mouseover", function (event, item) {
            if (item.mark.marktype === 'rect') {
                vegaview.update({
                    props: 'hover0',
                    items: item.cousin(1)
                });
            }
        })
        .on("mouseout", function (event, item) {
            if (item.mark.marktype === 'rect') {
                vegaview.update({
                    props: 'update0',
                    items: item.cousin(1)
                });
            }
        })
        .update()
            .on("click", function (event, item) {
                if (item.mark.marktype === 'rect') {
                    centerOnClickedHistoryRecord(item.cousin(1));
                }
            });
    });
}

function internalRedrawChart(elem) {
    "use strict";

    var dynamData = {};
    dynamData.rowdata = rowdata;
    dynamData.indexlist = indexlist;
    dynamData.minarray = minarray;
    dynamData.maxarray = maxarray;
    parseVegaSpec("js/vendor/tangelo-mentions/vegaBarChartSpec.json",dynamData,elem);
}

function updateHistoryLength() {
    "use strict";

    var length = parseInt(twitter.history_length.slider("value"));

    twitter.sourceRecorder.setMaxHistoryLength(length);
    twitter.targetRecorder.setMaxHistoryLength(length);
}

function updateHistoryStorageLength() {
    "use strict";

    var length = parseInt(twitter.history_storage_length.slider("value"));

    twitter.sourceRecorder.setHistoryLength(length);
    twitter.targetRecorder.setHistoryLength(length);
}

function drawHistoryChart(data, elementToDraw) {
    "use strict";

    //console.log("data to chart:  ",data)

    rowdata = [];
    indexlist = [];
    var row = [];
    minarray = [];
    maxarray = [];

    for (var i = 0; i < data.length; i++) {
        minarray[i] = 9e50;
        maxarray[i] = 1e-50;
        row = [];
        // push the index, the name, and the quantity into a list.  When this
        // was initially tested using in-memory storage, the array indices were
        // numeric, mongo return a JSON object, so pull out by field name.  Vega
        // is passed an array like this : [ [ 0,'howdydoody',3], [
        // 0,'someone',10], [ 2,'someoneelse',6], ...]
        row.push(i);
        row.push(data[i].tweeter); // push the name
        row.push(data[i].quantity); // push the number of tweets

        if (data[i].quantity < minarray[i]) {
            minarray[i] = data[i].quantity;
        }
        if (data[i].quantity > maxarray[i]) {
            maxarray[i] = data[i].quantity;
        }
        rowdata.push(row);
        indexlist.push({index: i});
    }

    //console.log("rowdata=",rowdata)
    internalRedrawChart(elementToDraw);
}

function clearHistoryCallback() {
    "use strict";

    twitter.sourceRecorder.reset();
    twitter.targetRecorder.reset();

    drawHistoryChart({},"#historychart1");
    drawHistoryChart({},"#historychart2");
}

var processCenterMessage = function (sender, msg) {
    "use strict";

    console.log("mention processing entity selection:", msg);
    var newCenter = msg[0];
    twitter.center.val(newCenter);
    updateGraph();
};

function initializeNeon() {
    "use strict";

    neon.SERVER_URL = "/neon";

    twitter.neon = new neon.query.Connection();
    twitter.neon.connect(neon.query.Connection.MONGO, twitter.host);
    twitter.neon.use(twitter.mentionsDatabase);
    twitter.neon.messenger = new neon.eventing.Messenger();
}

function testNeon() {
    "use strict";

    var conn,
        db,
        coll,
        mess,
        filter;

    neon.SERVER_URL = "/neon";

    conn = new neon.query.Connection();
    conn.connect(neon.query.Connection.MONGO, "localhost");

    db = "year2";
    coll = "twitter_mentions_sa";

    conn.use(db);

    mess = new neon.eventing.Messenger();
    filter = new neon.query.Filter()
        .selectFrom(db, coll)
        .where("source", "=", "monica_nino");

    mess.addSelection("foobar", filter, function () {
        var query = new neon.query.Query()
            .selectFrom(db, coll)
            .selectionOnly();

        conn.executeQuery(query, function (result) {
            console.log(result);
        });
    });
}

// $(function () {
//     "use strict";

//     twitter.sourceRecorder = new TweeterHistory({
//         indexMode: "source"
//     });

//     twitter.targetRecorder = new TweeterHistory({
//         indexMode: "target"
//     });

//     initializeNeon();

//     firstTimeInitialize();

//     // testNeon();
//});
// Wait for neon to be ready, the create our messenger and intialize the view and data.
neon.ready(function() {

    twitter.sourceRecorder = new TweeterHistory({
        indexMode: "source"
    });

    twitter.targetRecorder = new TweeterHistory({
        indexMode: "target"
    });

    initializeNeon();

    firstTimeInitialize();
});