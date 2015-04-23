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
.directive('directedGraph',['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', '$timeout', function(connectionService, datasetService, errorNotificationService, filterService, $timeout) {
    return {
        templateUrl: 'partials/directives/directedGraph.html',
        restrict: 'EA',
        scope: {
        },
        link: function($scope, element) {
            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            var chartOptions = $(element).find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            element.addClass('directedGraphDirective');

            $scope.TIMEOUT_MS = 250;
            $scope.uniqueId = uuid();
            $scope.databaseName = "";
            $scope.tables = [];
            $scope.selectedTable = {
                name: ""
            };
            $scope.fields = [];
            $scope.selectedNodeField = "";
            $scope.selectedLinkField = "";
            $scope.nodes = [];
            $scope.selectedNode = "";
            $scope.numberOfNodesInGraph = 0;
            $scope.nodeLimit = 500;
            $scope.filterKeys = {};
            $scope.errorMessage = undefined;
            $scope.filteredNodes = [];

            $scope.$watch('selectedNode', function() {
                if($scope.selectedNode !== "") {
                    if($scope.messenger && $scope.filteredNodes.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    $scope.filteredNodes = [];
                    $scope.addFilter($scope.selectedNode);
                }
            }, true);

            var updateSize = function() {
                var paddingTop = (element.outerHeight(true) - element.height()) / 2;
                var headerHeight = element.find('.config-row-div').outerHeight(true);
                element.find('#directed-graph-div-' + $scope.uniqueId).height(element.height() - paddingTop - headerHeight);
                return $timeout(redraw, $scope.TIMEOUT_MS);
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
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    if($scope.filteredNodes.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });

                element.resize(function() {
                    if($scope.resizePromise) {
                        $timeout.cancel($scope.resizePromise);
                    }
                    $scope.resizePromise = updateSize();
                });
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.databaseName && message.addedFilter.tableName === $scope.selectedTable.name) {
                    if(message.type.toUpperCase() === "ADD" || message.type.toUpperCase() === "REPLACE") {
                        if(message.addedFilter.whereClause) {
                            $scope.addFilterWhereClauseToFilterList(message.addedFilter.whereClause);
                        }
                    }
                    $scope.queryForData();
                }
            };

            /**
             * Adds the filter with the given where clause (or its children) to the list of graph filters if the filter's field matches the selected node field.
             * @param {Object} A where clause containing either {String} lhs and {String} rhs or {Array} whereClauses containing other where clause Objects.
             * @method addFilterWhereClauseToFilterList
             */
            $scope.addFilterWhereClauseToFilterList = function(whereClause) {
                if(whereClause.whereClauses) {
                    for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                        $scope.addFilterWhereClauseToFilterList(whereClause.whereClauses[i]);
                    }
                } else if(whereClause.lhs === $scope.selectedNodeField && whereClause.lhs && whereClause.rhs) {
                    $scope.addFilter(whereClause.rhs);
                }
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function() {
                $scope.displayActiveDataset(false);
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset()) {
                    return;
                }

                if(!$scope.graph) {
                    $scope.graph = new charts.DirectedGraph(element[0], ('#directed-graph-div-' + $scope.uniqueId), {
                        clickHandler: $scope.createClickHandler
                    });
                }

                $scope.data = [];
                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.selectedTable = datasetService.getFirstTableWithMappings(["graph_nodes"]) || $scope.tables[0];
                $scope.filterKeys = filterService.createFilterKeys("graph", $scope.tables);

                if(initializing) {
                    $scope.updateFieldsAndQueryForData();
                } else {
                    $scope.$apply(function() {
                        $scope.updateFieldsAndQueryForData();
                    });
                }
            };

            $scope.updateFieldsAndQueryForData = function() {
                $scope.fields = datasetService.getDatabaseFields($scope.selectedTable.name);
                $scope.selectedNodeField = datasetService.getMapping($scope.selectedTable.name, "graph_nodes") || "";
                $scope.selectedLinkField = datasetService.getMapping($scope.selectedTable.name, "graph_links") || "";
                $scope.queryForData();
            };

            $scope.addFilter = function(value) {
                $scope.selectedNode = "";

                var index = $scope.filteredNodes.indexOf(value);
                if(index >= 0) {
                    return;
                }

                $scope.filteredNodes.push(value);

                if($scope.messenger) {
                    var relations = datasetService.getRelations($scope.selectedTable.name, [$scope.selectedNodeField]);
                    if($scope.filteredNodes.length === 1) {
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    } else if($scope.filteredNodes.length > 1) {
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    }
                }
            };

            /**
             * Creates and returns a filter using the given table and fields.
             * @param {String} The name of the table on which to filter
             * @param {Array} An array containing the name of the selected field as its first element
             * @method createFilter
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilter = function(tableName, fieldNames) {
                var fieldName = fieldNames[0];
                var fullWhereClause = neon.query.where(fieldName, '=', $scope.filteredNodes[0]);
                for(var i = 1; i < $scope.filteredNodes.length; ++i) {
                    var whereClause = neon.query.where(fieldName, '=', $scope.filteredNodes[i]);
                    fullWhereClause = neon.query.or(fullWhereClause, whereClause);
                }
                return new neon.query.Filter().selectFrom($scope.databaseName, tableName).where(fullWhereClause);
            };

            $scope.removeFilter = function(value) {
                var index = $scope.filteredNodes.indexOf(value);
                if(index < 0) {
                    return;
                }

                $scope.filteredNodes.splice(index, 1);

                if($scope.messenger) {
                    if($scope.filteredNodes.length === 0) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys, $scope.queryForData);
                    } else {
                        var relations = datasetService.getRelations($scope.selectedTable.name, [$scope.selectedNodeField]);
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    }
                }
            };

            $scope.clearFilters = function() {
                $scope.filteredNodes = [];
                if($scope.messenger) {
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, $scope.queryForData);
                }
            };

            $scope.queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                if($scope.selectedNodeField) {
                    if($scope.filteredNodes.length) {
                        $scope.queryForFilteredNodeNetwork($scope.filteredNodes);
                    } else {
                        $scope.queryForNodeData();
                    }
                }
            };

            /**
             * Query for the list of nodes using the selected field and draw the graph containing those nodes.
             */
            $scope.queryForNodeData = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.selectedTable.name)
                    .groupBy($scope.selectedNodeField)
                    .withFields([$scope.selectedNodeField]);
                query.ignoreFilters([$scope.filterKeys[$scope.selectedTable.name]]);
                query.aggregate(neon.query.COUNT, '*', 'count');

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.executeQuery(query, function(data) {
                        $scope.nodes = [];
                        for(var i = 0; i < data.data.length; i++) {
                            var node = data.data[i][$scope.selectedNodeField];
                            if($scope.nodes.indexOf(node) < 0) {
                                $scope.nodes.push(node);
                            }
                        }

                        // Sort the nodes so they are displayed in order in the options dropdown.
                        $scope.nodes.sort(function(a, b) {
                            if(typeof a === "string" && typeof b === "string") {
                                return a.toLowerCase().localeCompare(b.toLowerCase());
                            }
                            if(a < b) {
                                return -1;
                            }
                            if(b < a) {
                                return 1;
                            }
                            return 0;
                        });

                        $scope.graph.setClickableNodes($scope.nodes);
                        $scope.createAndShowGraph(data);
                    }, function(response) {
                        $scope.updateGraph([], []);
                        $scope.errorMessage = errorNotificationService.showErrorMessage(element, response.responseJSON.error, response.responseJSON.stackTrace);
                    });
                }
            };

            /**
             * Query for the list of nodes that link to the filtered nodes and draw the graph containing the network.
             */
            $scope.queryForFilteredNodeNetwork = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.databaseName, $scope.selectedTable.name);

                var where = neon.query.where($scope.selectedNodeField, '=', $scope.filteredNodes[0]);
                var orWhere;
                for(var i = 1; i < $scope.filteredNodes.length; i++) {
                    orWhere = neon.query.where($scope.selectedNodeField, '=', $scope.filteredNodes[i]);
                    where = neon.query.or(where, orWhere);
                }
                query = query.where(where);
                query.ignoreFilters([$scope.filterKeys[$scope.selectedTable.name]]);

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.executeQuery(query, $scope.createAndShowGraph, function(response) {
                        $scope.updateGraph([], []);
                        $scope.errorMessage = errorNotificationService.showErrorMessage(element, response.responseJSON.error, response.responseJSON.stackTrace);
                    });
                }
            };

            $scope.createAndShowGraph = function(response) {
                var data = response.data;
                if(data.length >= $scope.nodeLimit) {
                    data = data.slice(0, $scope.nodeLimit);
                }

                // Maps a node value to a unique node ID to ensure each node we add to the graph is unique.
                var nodesIndexes = {};
                // Maps two node IDs to a unique link ID to ensure each link we add to the graph is unique.
                var linksIndexes = {};
                // The nodes to be added to the graph.
                var nodes = [];
                // The links to be added to the graph.
                var links = [];

                var addNodeIfUnique = function(value) {
                    if(nodesIndexes[value] === undefined) {
                        nodesIndexes[value] = nodes.length;
                        var colorGroup = 2;
                        if($scope.filteredNodes.indexOf(value) !== -1) {
                            colorGroup = 1;
                        } else if($scope.nodes.indexOf(value) !== -1) {
                            colorGroup = 3;
                        }

                        nodes.push({
                            name: value,
                            group: colorGroup
                        });
                    }
                };

                var addLinkIfUnique = function(value1, value2) {
                    var node1 = nodesIndexes[value1];
                    var node2 = nodesIndexes[value2];

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

                // Add each unique value from the data to the graph as a node.
                for(var i = 0; i < data.length; i++) {
                    var value = data[i][$scope.selectedNodeField];
                    if(value) {
                        addNodeIfUnique(value);

                        if($scope.selectedLinkField) {
                            var linkedNodes = (data[i][$scope.selectedLinkField] ? data[i][$scope.selectedLinkField] : []);
                            if(linkedNodes.constructor !== Array) {
                                linkedNodes = [linkedNodes];
                            }

                            if(linkedNodes.length >= $scope.nodeLimit) {
                                linkedNodes = linkedNodes.slice(0, $scope.nodeLimit);
                            }

                            // Add each related node to the graph as a node with a link to the original node.
                            for(var j = 0; j < linkedNodes.length; j++) {
                                var linkedNode = linkedNodes[j];
                                if(linkedNode) {
                                    addNodeIfUnique(linkedNodes[j]);
                                    addLinkIfUnique(value, linkedNodes[j]);
                                }
                            }
                        }
                    }
                }

                $scope.graph.setRootNodes($scope.filteredNodes);
                $scope.updateGraph(nodes, links);
            };

            $scope.updateGraph = function(nodes, links) {
                $scope.$apply(function() {
                    $scope.numberOfNodesInGraph = nodes.length;
                });

                $scope.graph.updateGraph({
                    nodes: nodes,
                    links: links
                });
            };

            $scope.createClickHandler = function(item) {
                if($scope.nodes.indexOf(item.name) !== -1) {
                    if($scope.filteredNodes.indexOf(item.name) === -1) {
                        $scope.$apply(function() {
                            $scope.addFilter(item.name);
                        });
                    } else {
                        $scope.$apply(function() {
                            $scope.removeFilter(item.name);
                        });
                    }
                }
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
