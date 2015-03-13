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
.directive('directedGraph', ['ConnectionService', '$timeout', function(connectionService, $timeout) {
    return {
        templateUrl: 'partials/directives/directedGraph.html',
        restrict: 'EA',
        scope: {
            startingFields: '='
        },
        link: function($scope, el) {
            el.addClass('directedGraphDirective');

            $scope.fieldsLabel = "Username";
            $scope.allowMoreFields = true;
            $scope.uniqueId = uuid();
            $scope.selectedUser = "";

            if($scope.startingFields) {
                $scope.groupFields = $scope.startingFields;
            } else {
                $scope.groupFields = [];
            }

            $scope.$watch('selectedUser', function() {
                if($scope.selectedUser !== "") {
                    $scope.groupFields.push($scope.selectedUser);
                    $scope.selectedUser = "";
                    $scope.render();
                }
            }, true);

            var updateSize = function() {
                el.find('#directed-graph-div-' + $scope.uniqueId).height(el.height() - el.find('.config-row-div').outerHeight(true) - 10);
                return $timeout(redraw, 250);
            };

            var redraw = function() {
                if($scope.graph) {
                    $scope.graph.redraw();
                }
                $scope.resizePromise = null;
            };

            $scope.initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    activeDatasetChanged: onDatasetChanged,
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                });

                el.resize(function() {
                    if($scope.resizePromise) {
                        $timeout.cancel($scope.resizePromise);
                    }
                    $scope.resizePromise = updateSize();
                });
            };

            var onFiltersChanged = function() {
                $scope.render();
            };

            var onDatasetChanged = function(message) {
                if(!$scope.graph) {
                    $scope.graph = new charts.DirectedGraph(el[0], ('#directed-graph-div-' + $scope.uniqueId), {
                        shiftClickHandler: $scope.shiftClickHandler,
                        doubleClickHandler: $scope.doubleClickHandler
                    });
                }

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
                        $scope.graph.setClickableNodes($scope.users);

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

                    $scope.graph.setRootNodes($scope.groupFields);
                    $scope.graph.updateGraph({
                        nodes: nodes,
                        links: links
                    });
                }
            };

            $scope.doubleClickHandler = function(d) {
                $scope.$apply(function() {
                    $scope.groupFields[0] = d.name;
                    $scope.render();
                });
            };

            $scope.shiftClickHandler = function(d) {
                if($scope.users.indexOf(d.name) !== -1 && $scope.groupFields.indexOf(d.name) === -1) {
                    $scope.$apply(function() {
                        $scope.groupFields.push(d.name);
                        $scope.render();
                    });
                }
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
            });
        }
    };
}]);
