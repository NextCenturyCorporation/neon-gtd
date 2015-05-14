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
.directive('directedGraph',['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', '$timeout',
function(connectionService, datasetService, errorNotificationService, filterService, $timeout) {
    return {
        templateUrl: 'partials/directives/directedGraph.html',
        restrict: 'EA',
        scope: {
        },
        link: function($scope, $element) {
            $element.addClass('directedGraphDirective');

            $scope.element = $element;

            $scope.optionsMenuButtonText = function() {
                if($scope.numberOfNodesInGraph === 0) {
                    return "No graph data available";
                } else if($scope.numberOfNodesInGraph >= $scope.options.nodeLimit) {
                    return $scope.options.nodeLimit + " node limit";
                }
                return "";
            };
            $scope.showOptionsMenuButtonText = function() {
                return $scope.numberOfNodesInGraph === 0 ||$scope.numberOfNodesInGraph >= $scope.options.nodeLimit;
            };

            $scope.TIMEOUT_MS = 250;
            $scope.uniqueId = uuid();
            $scope.databaseName = "";
            $scope.tables = [];
            $scope.fields = [];
            $scope.nodes = [];
            $scope.numberOfNodesInGraph = 0;
            $scope.filterKeys = {};
            $scope.errorMessage = undefined;
            $scope.filteredNodes = [];

            $scope.options = {
                selectedTable: {
                    name: ""
                },
                selectedNodeField: "",
                selectedLinkField: "",
                selectedNode: "",
                nodeLimit: 500
            };

            $scope.$watch('options.selectedNode', function() {
                if($scope.options.selectedNode !== "") {
                    if($scope.messenger && $scope.filteredNodes.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    $scope.filteredNodes = [];
                    $scope.addFilter($scope.options.selectedNode);
                }
            }, true);

            $scope.calculateGraphHeight = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                return $element.height() - headerHeight;
            };

            $scope.calculateGraphWidth = function() {
                return $element.width();
            };

            var updateGraphSize = function() {
                // The D3 graph will resize itself but we need to trigger that resize event by changing the height and widget of the SVG.
                // Setting the dimensions on the SVG performs better than just setting the dimensions on the directed-graph-container.
                $element.find(".directed-graph .directed-graph-container svg").attr("height", $scope.calculateGraphHeight());
                $element.find(".directed-graph .directed-graph-container svg").attr("width", $scope.calculateGraphWidth());
                return $timeout($scope.redraw, $scope.TIMEOUT_MS);
            };

            var updateSize = function() {
                if($scope.resizePromise) {
                    $timeout.cancel($scope.resizePromise);
                }
                $scope.resizePromise = updateGraphSize();
            };

            $scope.redraw = function() {
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
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "directed-graph",
                        elementType: "canvas",
                        elementSub: "directed-graph",
                        elementGroup: "graph_group",
                        source: "user",
                        tags: ["remove", "directed-graph"]
                    });
                    $element.off("resize", updateSize);
                    $scope.messenger.removeEvents();
                    if($scope.filteredNodes.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });

                $element.resize(updateSize);
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.databaseName && message.addedFilter.tableName === $scope.options.selectedTable.name) {
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
                } else if(whereClause.lhs === $scope.options.selectedNodeField && whereClause.lhs && whereClause.rhs) {
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
                    $scope.graph = new charts.DirectedGraph($element[0], (".directed-graph-container-" + $scope.uniqueId), {
                        calculateHeight: $scope.calculateGraphHeight,
                        calculateWidth: $scope.calculateGraphWidth,
                        clickHandler: $scope.createClickHandler
                    });
                }

                $scope.data = [];
                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.options.selectedTable = datasetService.getFirstTableWithMappings(["graph_nodes"]) || $scope.tables[0];
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
                $scope.fields = datasetService.getDatabaseFields($scope.options.selectedTable.name);
                $scope.fields.sort();
                $scope.options.selectedNodeField = datasetService.getMapping($scope.options.selectedTable.name, "graph_nodes") || "";
                $scope.options.selectedLinkField = datasetService.getMapping($scope.options.selectedTable.name, "graph_links") || "";
                $scope.queryForData();
            };

            $scope.addFilter = function(value) {
                $scope.options.selectedNode = "";

                var index = $scope.filteredNodes.indexOf(value);
                if(index >= 0) {
                    return;
                }

                $scope.filteredNodes.push(value);

                if($scope.messenger) {
                    var relations = datasetService.getRelations($scope.options.selectedTable.name, [$scope.options.selectedNodeField]);
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
                        var relations = datasetService.getRelations($scope.options.selectedTable.name, [$scope.options.selectedNodeField]);
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

                if($scope.options.selectedNodeField) {
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
                    .selectFrom($scope.databaseName, $scope.options.selectedTable.name)
                    .groupBy($scope.options.selectedNodeField)
                    .withFields([$scope.options.selectedNodeField]);
                query.ignoreFilters([$scope.filterKeys[$scope.options.selectedTable.name]]);
                query.aggregate(neon.query.COUNT, '*', 'count');

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.executeQuery(query, function(data) {
                        $scope.nodes = [];
                        for(var i = 0; i < data.data.length; i++) {
                            var node = data.data[i][$scope.options.selectedNodeField];
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
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
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
                    .selectFrom($scope.databaseName, $scope.options.selectedTable.name);

                var where = neon.query.where($scope.options.selectedNodeField, '=', $scope.filteredNodes[0]);
                var orWhere;
                for(var i = 1; i < $scope.filteredNodes.length; i++) {
                    orWhere = neon.query.where($scope.options.selectedNodeField, '=', $scope.filteredNodes[i]);
                    where = neon.query.or(where, orWhere);
                }
                query = query.where(where);
                query.ignoreFilters([$scope.filterKeys[$scope.options.selectedTable.name]]);

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.executeQuery(query, function(response) {
                        if(response.data.length) {
                            $scope.createAndShowGraph(response);
                        } else if($scope.filteredNodes.length) {
                            // If the filters cause the query to return no data, remove the most recent filter and query again.  This can happen if the user
                            // creates a filter in the Filter Builder (which the graph automatically adds as a filter) on a node that doesn't exist.
                            $scope.removeFilter($scope.filteredNodes[$scope.filteredNodes.length - 1]);
                        }
                    }, function(response) {
                        $scope.updateGraph([], []);
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    });
                }
            };

            $scope.createAndShowGraph = function(response) {
                var data = response.data;
                if(data.length >= $scope.options.nodeLimit) {
                    data = data.slice(0, $scope.options.nodeLimit);
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
                    var value = data[i][$scope.options.selectedNodeField];
                    if(value) {
                        addNodeIfUnique(value);

                        if($scope.options.selectedLinkField) {
                            var linkedNodes = (data[i][$scope.options.selectedLinkField] ? data[i][$scope.options.selectedLinkField] : []);
                            if(linkedNodes.constructor !== Array) {
                                linkedNodes = [linkedNodes];
                            }

                            if(linkedNodes.length >= $scope.options.nodeLimit) {
                                linkedNodes = linkedNodes.slice(0, $scope.options.nodeLimit);
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
