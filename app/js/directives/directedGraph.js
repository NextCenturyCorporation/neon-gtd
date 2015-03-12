'use strict';
/*
 * Copyright 2014 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

angular.module('neonDemo.directives')
.directive('directedGraph', ['ConnectionService', function(connectionService) {
    return {
        templateUrl: 'partials/directives/directedGraph.html',
        restrict: 'EA',
        scope: {
            startingFields: '='
        },
        link: function($scope) {
            $scope.fieldsLabel = "Username";
            $scope.allowMoreFields = true;
            $scope.uniqueId = uuid();

            if($scope.startingFields) {
                $scope.groupFields = $scope.startingFields;
            } else {
                $scope.groupFields = [];
            }

            // $scope.$watch('groupFields', function() {
            //     $scope.render();
            // }, true);

            $scope.initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    activeDatasetChanged: onDatasetChanged,
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                });
            };

            var onFiltersChanged = function() {
                $scope.render();
            };

            var onDatasetChanged = function(message) {
                $scope.databaseName = message.database;
                $scope.tableName = message.table;
                $scope.data = [];

                // if there is no active connection, try to make one.
                connectionService.connectToDataset(message.datastore, message.hostname, message.database, message.table);

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connectionService.loadMetadata(function() {
                        $scope.queryForUsers(function(data) {
                            //$scope.populateDropdown(data.data);
                            $scope.render(data);
                        });
                    });
                }
            };

            $scope.removeField = function(field) {
                var index = $scope.groupFields.indexOf(field);
                if(index !== -1) {
                    $scope.groupFields.splice(index, 1);
                    $scope.render();
                }
            };

            $scope.render = function(data) {
                if($scope.groupFields.length > 0) {
                    if($scope.groupFields[$scope.groupFields.length - 1] === "") {
                        $scope.groupFields.splice($scope.groupFields.length - 1, 1);
                    }
                    return $scope.queryForData();
                }

                if(data) {
                    return $scope.calculateGraphData(data);
                } else {
                    $scope.queryForUsers($scope.calculateGraphData);
                }
            };

            $scope.queryForData = function() {
                $scope.queryForUsers($scope.queryForGraphData);
            };

            $scope.queryForUsers = function(next) {
                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.tableName);

                //query = query.groupBy.apply(query, $scope.groupFields);
                query = query.withFields(["label"]);

                var connection = connectionService.getActiveConnection();

                if(connection) {
                    connection.executeQuery(query, function(data) {
                        $scope.users = [];
                        for(var i = 0; i < data.data.length; i++) {
                            if($scope.users.indexOf(data.data[i].label)) {
                                $scope.users.push(data.data[i].label);
                            }
                        }
                        next(data);
                    });
                } else {
                    d3.select("#node-click-name").text("No database connection.");
                }
            };

            $scope.queryForGraphData = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.tableName);

                //query = query.groupBy.apply(query, $scope.groupFields);
                var where = neon.query.where('label', '=', $scope.groupFields[0]);
                var orWhere;
                for(var i = 1; i < $scope.groupFields.length; i++) {
                    orWhere = neon.query.where('label', '=', $scope.groupFields[i]);
                    where = neon.query.or(where, orWhere);
                }
                query = query.where(where);

                var connection = connectionService.getActiveConnection();

                if(connection) {
                    d3.select("#node-click-name").text("");
                    connection.executeQuery(query, $scope.calculateGraphData);
                } else {
                    d3.select("#node-click-name").text("No database connection.");
                }
            };

            $scope.calculateGraphData = function(response) {
                if(response.data.length === 0) {
                    d3.select("#node-click-name").text("Unknown user");
                } else {
                    var data = response.data;
                    if(data.length >= 1000) {
                        d3.select("#node-click-name").text("Limiting display to 1000 records per user");
                        data = data.slice(0, 1001);
                    }

                    var nodesIndexes = {};
                    var nodes = [];
                    var linksIndexes = {};
                    var links = [];

                    var addNodesIfUnique = function(value) {
                        if(nodesIndexes[value] === undefined) {
                            nodesIndexes[value] = nodes.length;
                            var colorGroup;
                            if($scope.groupFields.indexOf(value) !== -1) {
                                colorGroup = 1;
                            } else if($scope.users.indexOf(value) !== -1) {
                                colorGroup = 3;
                            } else {
                                colorGroup = 2;
                            }
                            nodes.push({
                                name: value,
                                group: colorGroup
                            });
                        }
                        return nodesIndexes[value];
                    };

                    var addLinkIfUnique = function(node1, node2) {
                        if(!linksIndexes[node1]) {
                            linksIndexes[node1] = {};
                        }

                        if(!linksIndexes[node1][node2]) {
                            linksIndexes[node1][node2] = links.length;
                            links.push({
                                source: node1,
                                target: node2,
                                value: 1
                            });
                        }
                    };

                    var node1;
                    var node2;
                    var relatedNodes;
                    for(var i = 0; i < data.length; i++) {
                        node1 = addNodesIfUnique(data[i].label);
                        relatedNodes = (data[i].attributeList ? data[i].attributeList : []);
                        if(relatedNodes.length >= 1000) {
                            d3.select("#node-click-name").text("Limiting display to 1000 records");
                            relatedNodes = relatedNodes.slice(0, 1001);
                        }

                        for(var j = 0; j < relatedNodes.length; j++) {
                            node2 = addNodesIfUnique(relatedNodes[j]);
                            addLinkIfUnique(node1, node2);
                        }
                    }

                    $scope.updateGraph({
                        nodes: nodes,
                        links: links
                    });
                }
            };

            $scope.svgId = "directed-svg-" + $scope.uniqueId;

            $scope.updateGraph = function(data) {
                var graphDiv = $("." + $scope.uniqueId)[0];
                var tooltipDiv = d3.select(graphDiv)
                    .append("div")
                    .attr("class", "graph-tooltip");
                    //.style("opacity", 0);
                var nodes = data.nodes;

                var svg = d3.select("#" + $scope.svgId);
                if(svg) {
                    svg.remove();
                }

                var width = 600;
                var height = 300;

                var color = d3.scale.category10();

                svg = d3.select("#directed-graph-div-" + $scope.uniqueId)
                    .append("svg")
                        .attr("id", $scope.svgId)
                    .attr({
                        width: "100%",
                        height: "100%"
                    })
                    .attr("viewBox", "0 0 " + width + " " + height)
                    .attr("preserveAspectRatio", "xMidYMid meet")
                    .attr("pointer-events", "all")
                    .call(d3.behavior.zoom().on("zoom", redraw));

                var vis = svg
                    .append('svg:g');

                function redraw() {
                    vis.attr("transform", "translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")");
                }

                var force = d3.layout.force()
                    .charge(-300)
                    .linkDistance(100)
                    .size([width, height])
                    .gravity(0.05);

                force
                .nodes(data.nodes);

                var link;
                if(data.links) {
                    force.links(data.links);

                    link = vis.selectAll(".link")
                        .data(data.links)
                    .enter().append("line")
                        .attr("class", "link")
                        .style("stroke-width", function(d) {
                            return Math.sqrt(d.value);
                        });
                }

                var node = vis.selectAll(".node")
                    .data(data.nodes)
                .enter().append("g")
                    .attr("class", "node")
                .append("circle")
                    .attr("r", 5)
                    .style("fill", function(d) {
                        return color(d.group);
                    })
                    .call(force.drag);

                vis.selectAll("g.node").selectAll("circle")
                .append("title")
                .text(function(n) {
                    return n.name;
                });

                var setupForceLayoutTick = function() {
                    force.on("tick", function() {
                        svg.selectAll("line").attr("x1", function(d) {
                            return d.source.x;
                        })
                        .attr("y1", function(d) {
                            return d.source.y;
                        })
                        .attr("x2", function(d) {
                            return d.target.x;
                        })
                        .attr("y2", function(d) {
                            return d.target.y;
                        });

                        svg.selectAll("g.node")
                        .attr("cx", function(d) {
                            return d.x;
                        })
                        .attr("cy", function(d) {
                            return d.y;
                        });

                        nodes[0].x = width / 2;
                        nodes[0].y = height / 2;
                    });
                };

                var runForceLayoutSimulation = function() {
                    force.start();
                    var i = 0;
                    while(force.alpha() > 0.01 && i++ < 1000) {
                        force.tick();
                    }
                    force.stop();

                    svg.selectAll(".node").each(function(nodeData) {
                        nodeData.fixed = true;
                    });
                };

                setupForceLayoutTick();
                runForceLayoutSimulation();
                force.start();

                node.on('dblclick', function(d) {
                    $scope.$apply(function() {
                        $scope.groupFields[0] = d.name;
                    });
                }).on("click", function(d) {
                    //d3.select("#node-click-name").text(d.name);
                    if(d3.event.shiftKey) {
                        if($scope.users.indexOf(d.name) !== -1 &&
                            $scope.groupFields.indexOf(d.name) === -1) {
                            $scope.$apply(function() {
                                $scope.groupFields.push(d.name);
                                $scope.render();
                            });
                        }
                    }
                }).on("mouseover", function(d) {
                    var parentOffset = $("." + $scope.uniqueId).offset();

                    tooltipDiv.transition()
                        .duration(200)
                        .style("opacity", 0.9);

                    tooltipDiv.html(d.name)
                        .style("left", (d3.event.pageX - parentOffset.left + 10) + "px")
                        .style("top", (d3.event.pageY - parentOffset.top - 20) + "px");
                }).on("mouseout", function() {
                    tooltipDiv.transition()
                    .duration(500)
                    .style("opacity", 0);
                });

                force.on("tick", function() {
                    link.attr("x1", function(d) {
                            return d.source.x;
                        })
                        .attr("y1", function(d) {
                            return d.source.y;
                        })
                        .attr("x2", function(d) {
                            return d.target.x;
                        })
                        .attr("y2", function(d) {
                            return d.target.y;
                        });

                    node.attr("cx", function(d) {
                            return d.x;
                        })
                        .attr("cy", function(d) {
                            return d.y;
                        });
                });
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
            });
        }
    };
}]);
