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
.directive('directedGraph', ['$timeout', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService',
function($timeout, connectionService, datasetService, errorNotificationService, filterService, exportService) {
    return {
        templateUrl: 'partials/directives/directedGraph.html',
        restrict: 'EA',
        scope: {
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('directedGraphDirective');

            $scope.element = $element;

            $scope.optionsMenuButtonText = function() {
                if($scope.numberOfNodesInGraph === 0) {
                    return "No graph data available";
                }
                if($scope.numberOfNodesInGraph >= $scope.options.nodeLimit) {
                    return $scope.options.nodeLimit + " nodes (data limit)";
                }
                return $scope.numberOfNodesInGraph + " nodes";
            };
            $scope.showOptionsMenuButtonText = function() {
                return true;
            };

            $scope.TIMEOUT_MS = 250;
            $scope.uniqueId = uuid();

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.nodes = [];
            $scope.numberOfNodesInGraph = 0;
            $scope.filterKeys = {};
            $scope.filteredNodes = [];
            $scope.errorMessage = undefined;
            $scope.loadingData = false;

            $scope.options = {
                database: {},
                table: {},
                selectedNodeField: "",
                selectedLinkField: "",
                selectedNode: "",
                nodeLimit: 500
            };

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

            $scope.selectNode = function() {
                if($scope.options.selectedNode !== "") {
                    if($scope.messenger && $scope.filteredNodes.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    $scope.filteredNodes = [];
                    $scope.addFilter($scope.options.selectedNode);
                }
            };

            $scope.initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    $scope.queryForData();
                });

                $scope.exportID = exportService.register($scope.makeDirectedGraphExportObject);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "directed-graph",
                        elementType: "canvas",
                        elementSub: "directed-graph",
                        elementGroup: "graph_group",
                        source: "system",
                        tags: ["remove", "directed-graph"]
                    });
                    $element.off("resize", updateSize);
                    $scope.messenger.removeEvents();
                    exportService.unregister($scope.exportID);
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
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    if(message.type.toUpperCase() === "ADD" || message.type.toUpperCase() === "REPLACE") {
                        if(message.addedFilter.whereClause) {
                            $scope.addFilterWhereClauseToFilterList(message.addedFilter.whereClause);
                        }
                    }
                    $scope.queryForData(true);
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
                } else if(whereClause.lhs === $scope.options.selectedNodeField.columnName && whereClause.lhs && whereClause.rhs) {
                    $scope.addFilter(whereClause.rhs);
                }
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                if(!$scope.graph) {
                    $scope.graph = new charts.DirectedGraph($element[0], (".directed-graph-container-" + $scope.uniqueId), {
                        calculateHeight: $scope.calculateGraphHeight,
                        calculateWidth: $scope.calculateGraphWidth,
                        clickHandler: $scope.createClickHandler
                    });
                }

                $scope.nodes = [];
                $scope.data = [];
                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];
                $scope.filterKeys = filterService.createFilterKeys("graph", datasetService.getDatabaseAndTableNames());

                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, ["graph_nodes"]) || $scope.tables[0];
                $scope.updateFields();
            };

            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);

                var selectedNodeField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_nodes") || "";
                $scope.options.selectedNodeField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedNodeField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var selectedLinkField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "graph_links") || "";
                $scope.options.selectedLinkField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedLinkField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };

                $scope.queryForData(true);
            };

            $scope.addFilter = function(value) {
                $scope.options.selectedNode = "";

                var nodesIndex = $scope.nodes.indexOf(value);
                if(nodesIndex < 0) {
                    return;
                }

                var filteredNodesIndex = $scope.filteredNodes.indexOf(value);
                if(filteredNodesIndex >= 0) {
                    return;
                }

                $scope.filteredNodes.push(value);

                if($scope.messenger) {
                    var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.selectedNodeField.columnName]);
                    if($scope.filteredNodes.length === 1) {
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForNode, "Graph", $scope.queryForData);
                    } else if($scope.filteredNodes.length > 1) {
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForNode, "Graph", $scope.queryForData);
                    }
                }
            };

            /**
             * Creates and returns a filter on the given node field using the nodes set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} nodeFieldName The name of the node field on which to filter
             * @method createFilterClauseForNode
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilterClauseForNode = function(databaseAndTableName, nodeFieldName) {
                var filterClause = neon.query.where(nodeFieldName, '=', $scope.filteredNodes[0]);
                for(var i = 1; i < $scope.filteredNodes.length; ++i) {
                    filterClause = neon.query.or(filterClause, neon.query.where(nodeFieldName, '=', $scope.filteredNodes[i]));
                }
                return filterClause;
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
                        var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.selectedNodeField.columnName]);
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForNode, "Graph", $scope.queryForData);
                    }
                }
            };

            $scope.clearFilters = function() {
                $scope.filteredNodes = [];
                if($scope.messenger) {
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                        $scope.queryForData(true);
                    });
                }
            };

            $scope.queryForData = function(shouldQueryForNodeList) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.selectedNodeField.columnName || !$scope.filteredNodes.length) {
                    $scope.numberOfNodesInGraph = 0;
                    // Don't call $scope.updateGraph() here.  It will cause an error because we're in a $scope.$apply.
                    $scope.graph.updateGraph({
                        nodes: [],
                        links: []
                    });
                    $scope.loadingData = false;
                }

                if(connection && $scope.options.selectedNodeField.columnName) {
                    queryForFilteredNodeNetwork(connection);
                    if(shouldQueryForNodeList) {
                        queryForNodeList(connection);
                    }
                }
            };

            /**
             * Query for the list of nodes using the selected field but do not draw a graph.
             */
            var queryForNodeList = function(connection) {
                var query = createNodeListQuery();

                connection.executeQuery(query, function(data) {
                    $scope.nodes = [];
                    for(var i = 0; i < data.data.length; i++) {
                        var node = data.data[i][$scope.options.selectedNodeField.columnName];
                        if($scope.nodes.indexOf(node) < 0) {
                            $scope.nodes.push(node);
                        }
                    }

                    // Sort the nodes so they are displayed in alphabetical order in the options dropdown.
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
                }, function(response) {
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            var createNodeListQuery = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .withFields([$scope.options.selectedNodeField.columnName])
                    .groupBy($scope.options.selectedNodeField.columnName)
                    .aggregate(neon.query.COUNT, '*', 'count')
                    .ignoreFilters([$scope.filterKeys[$scope.options.database.name][$scope.options.table.name]]);

                return query;
            };

            /**
             * Query for the list of nodes that link to the filtered nodes and draw the graph containing the network.
             */
            var queryForFilteredNodeNetwork = function(connection) {
                var query = createFilteredNodeNetworkQuery();

                connection.executeQuery(query, function(response) {
                    if(response.data.length) {
                        $scope.createAndShowGraph(response);
                    } else if($scope.filteredNodes.length) {
                        // If the filters cause the query to return no data, remove the most recent filter and query again.  This can happen if the user
                        // creates a filter in the Filter Builder (which the graph automatically adds as a filter) on a node that doesn't exist.
                        $scope.removeFilter($scope.filteredNodes[$scope.filteredNodes.length - 1]);
                    }
                    $scope.loadingData = false;
                }, function(response) {
                    $scope.updateGraph([], []);
                    $scope.loadingData = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            var createFilteredNodeNetworkQuery = function() {
                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .withFields([$scope.options.selectedNodeField.columnName, $scope.options.selectedLinkField.columnName]);

                var where = neon.query.where($scope.options.selectedNodeField.columnName, '=', $scope.filteredNodes[0]);
                var orWhere;
                for(var i = 1; i < $scope.filteredNodes.length; i++) {
                    orWhere = neon.query.where($scope.options.selectedNodeField.columnName, '=', $scope.filteredNodes[i]);
                    where = neon.query.or(where, orWhere);
                }
                query = query.where(where);
                query.ignoreFilters([$scope.filterKeys[$scope.options.database.name][$scope.options.table.name]]);

                return query;
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
                        if($scope.filteredNodes.indexOf(value) >= 0) {
                            colorGroup = 1;
                        } else if($scope.nodes.indexOf(value) >= 0) {
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
                    var value = data[i][$scope.options.selectedNodeField.columnName];
                    if(value) {
                        addNodeIfUnique(value);

                        if($scope.options.selectedLinkField.columnName) {
                            var linkedNodes = (data[i][$scope.options.selectedLinkField.columnName] ? data[i][$scope.options.selectedLinkField.columnName] : []);
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
                if($scope.nodes.indexOf(item.name) >= 0) {
                    if($scope.filteredNodes.indexOf(item.name) >= 0) {
                        $scope.$apply(function() {
                            $scope.removeFilter(item.name);
                        });
                    } else {
                        $scope.$apply(function() {
                            $scope.addFilter(item.name);
                        });
                    }
                }
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeDirectedGraphExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "directed-graph-export",
                    elementType: "button",
                    elementGroup: "graph_group",
                    source: "user",
                    tags: ["options", "directed-graph", "export"]
                });
                var query = createFilteredNodeNetworkQuery();
                query.limitClause = exportService.getLimitClause();
                query.ignoreFilters_ = exportService.getIgnoreFilters();
                query.ignoredFilterIds_ = exportService.getIgnoredFilterIds();
                var fields = [];
                if($scope.options.selectedNodeField.columnName && $scope.options.selectedLinkField.columnName) {
                    fields = [{
                        query: $scope.options.selectedNodeField.columnName,
                        pretty: $scope.options.selectedNodeField.prettyName
                    },{
                        query: $scope.options.selectedLinkField.columnName,
                        pretty: $scope.options.selectedLinkField.prettyName
                    }];
                    query.groupBy($scope.options.selectedNodeField.columnName, $scope.options.selectedLinkField.columnName);
                } else if($scope.options.selectedNodeField.columnName) {
                    fields = [{
                        query: $scope.options.selectedNodeField.columnName,
                        pretty: $scope.options.selectedNodeField.prettyName
                    }];
                    query.groupBy($scope.options.selectedNodeField.columnName);
                } else if($scope.options.selectedLinkField.columnName) {
                    fields = [{
                        query: $scope.options.selectedLinkField.columnName,
                        pretty: $scope.options.selectedLinkField.prettyName
                    }];
                    query.groupBy($scope.options.selectedLinkField.columnName);
                }

                var finalObject = {
                    name: "Directed Graph",
                    data: [{
                        query: query,
                        name: "directedGraph-" + $scope.exportID,
                        fields: fields,
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                return finalObject;
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
