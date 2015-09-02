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
.directive('directedGraph', ['$filter', '$timeout', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService',
function($filter, $timeout, connectionService, datasetService, errorNotificationService, filterService, exportService) {
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
                if($scope.graphNodes.length === 0) {
                    return "No graph data available";
                }
                var text = $scope.numberOfVisibleNodes + " nodes";
                if($scope.bucketizer && $scope.selectedDateBucket) {
                    var date = $filter("date")($scope.bucketizer.getDateForBucket($scope.selectedDateBucket).toISOString(), $scope.bucketizer.getDateFormat());
                    text += " (" + date + ")";
                }
                if($scope.dataLimited) {
                    text += " [data limited]";
                }
                return text;
            };
            $scope.showOptionsMenuButtonText = function() {
                return true;
            };

            var NODE_TYPE = "node";
            var CLUSTER_TYPE = "cluster";

            var DEFAULT_NODE_GROUP = "default";
            var QUERIED_NODE_GROUP = "queried";
            var CLUSTER_NODE_GROUP = "cluster";
            var UNKNOWN_NODE_GROUP = "unknown";

            // Colors copied from d3.scale.category10().
            var DEFAULT_NODE_COLOR = "#1f77b4";
            var QUERIED_NODE_COLOR = "#2ca02c";
            var UNKNOWN_NODE_COLOR = "#d62728";
            var CLUSTER_NODE_COLOR = "#9467bd";

            $scope.TIMEOUT_MS = 250;

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.numberOfVisibleNodes = 0;
            $scope.dataLimited = false;
            $scope.filterKeys = {};
            $scope.filteredNodes = [];
            $scope.filterableNodes = [];
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.bucketizer = dateBucketizer();

            $scope.options = {
                database: {},
                table: {},
                selectedNodeField: {},
                selectedLinkField: {},
                selectedDateField: {},
                selectedNode: "",
                dataLimit: 500000,
                reloadOnFilter: false
            };

            // Save the data from the last network graph query to animate it on "date selected" events.
            $scope.graphNodes = [];
            $scope.graphLinks = [];
            $scope.dateBucketToNodeIndex = {};
            $scope.dateBucketToLinkIndex = {};
            $scope.selectedDateBucket = undefined;

            var calculateGraphHeight = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                return $element.height() - headerHeight;
            };

            var calculateGraphWidth = function() {
                return $element.width();
            };

            var updateGraphSize = function() {
                // The D3 graph will resize itself but we need to trigger that resize event by changing the height and widget of the SVG.
                // Setting the dimensions on the SVG performs better than just setting the dimensions on the directed-graph-container.
                $element.find(".directed-graph .directed-graph-container svg").attr("height", calculateGraphHeight());
                $element.find(".directed-graph .directed-graph-container svg").attr("width", calculateGraphWidth());
                return $timeout(redraw, $scope.TIMEOUT_MS);
            };

            var updateSize = function() {
                if($scope.resizePromise) {
                    $timeout.cancel($scope.resizePromise);
                }
                $scope.resizePromise = updateGraphSize();
            };

            var redraw = function() {
                if($scope.graph) {
                    $scope.graph.redraw();
                }
                $scope.resizePromise = null;
            };

            /**
             * Adds a node filter for the value of the global selected node variable.
             * @method selectNode
             */
            $scope.selectNode = function() {
                if($scope.options.selectedNode !== "") {
                    var value = Number($scope.options.selectedNode) ? Number($scope.options.selectedNode) : $scope.options.selectedNode;

                    if($scope.filteredNodes.indexOf(value) < 0) {
                        $scope.addFilter(value);
                    }
                }
            };

            var initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    $scope.queryForData();
                });
                $scope.messenger.subscribe("date_bucketizer", function(message) {
                    $scope.bucketizer = message.bucketizer;
                    initializeDateBuckets();
                });
                $scope.messenger.subscribe("date_selected", onDateSelected);

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
                    var reloadNetworkGraph = false;
                    if(message.type.toUpperCase() === "ADD" || message.type.toUpperCase() === "REPLACE") {
                        if(message.addedFilter.whereClause) {
                            addFilterWhereClauseToFilterList(message.addedFilter.whereClause);
                        }
                        reloadNetworkGraph = $scope.options.reloadOnFilter;
                    }
                    $scope.queryForData(reloadNetworkGraph);
                }
            };

            /**
             * Adds the filter with the given where clause (or its children) to the list of graph filters if the filter's field matches the selected node field.
             * @param {Object} A where clause containing either {String} lhs and {String} rhs or {Array} whereClauses containing other where clause Objects.
             * @method addFilterWhereClauseToFilterList
             * @private
             */
            var addFilterWhereClauseToFilterList = function(whereClause) {
                if(whereClause.whereClauses) {
                    for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                        addFilterWhereClauseToFilterList(whereClause.whereClauses[i]);
                    }
                } else if(whereClause.lhs === $scope.options.selectedNodeField.columnName && whereClause.lhs && whereClause.rhs) {
                    $scope.addFilter(whereClause.rhs);
                } else if($scope.options.selectedLinkField && whereClause.lhs === $scope.options.selectedLinkField.columnName && whereClause.lhs && whereClause.rhs) {
                    $scope.addFilter(whereClause.rhs);
                }
            };

            /**
             * Event handler for date selected events issued over Neon's messaging channels.
             * @param {Object} message A Neon date selected message.
             * @method onDateSelected
             * @private
             */
            var onDateSelected = function(message) {
                if(!message.start && !$scope.selectedDateBucket) {
                    return;
                }

                if($scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
                    var bucket = undefined;
                    var nodes = $scope.graphNodes;
                    var links = $scope.graphLinks;

                    if(message.start) {
                        bucket = $scope.bucketizer.getBucketIndex(message.start);
                        if(bucket === $scope.selectedDateBucket) {
                            return;
                        }

                        nodes = $scope.graphNodes.slice(0, $scope.dateBucketToNodeIndex[bucket]);
                        nodes.forEach(function(node) {
                            if(node.dateBucketToNodeIndex && node.nodes) {
                                node.nodesForSelectedDateBucket = node.nodes.slice(0, node.dateBucketToNodeIndex[bucket]);
                            }
                        });

                        links = $scope.graphLinks.slice(0, $scope.dateBucketToLinkIndex[bucket]);
                    }

                    $scope.selectedDateBucket = bucket;
                    $scope.numberOfVisibleNodes = nodes.length;

                    $scope.graph.updateGraph({
                        nodes: nodes,
                        links: links
                    });
                }
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             * @private
             */
            var displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                if(!$scope.graph) {
                    $scope.graph = new charts.DirectedGraph($element[0], ".directed-graph-container", {
                        getHeight: calculateGraphHeight,
                        getWidth: calculateGraphWidth,
                        getNodeSize: calculateNodeSize,
                        getNodeColor: calculateNodeColor,
                        getNodeText: createNodeText,
                        getNodeTooltip: createNodeTooltip,
                        getLinkSize: calculateLinkSize,
                        getNodeKey: getNodeKey,
                        getLinkKey: getLinkKey,
                        nodeClickHandler: onNodeClicked
                    });
                }

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

            /**
             * Updates the tables available in this visualization using the selected database and the active dataset.
             * @method updateTables
             */
            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, ["graph_nodes"]) || $scope.tables[0];
                $scope.updateFields();
            };

            /**
             * Updates the fields available in this visualization using the selected database/table and the active dataset.
             * @method updateFields
             */
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
                var selectedDateField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "date") || "";
                $scope.options.selectedDateField = _.find($scope.fields, function(field) {
                    return field.columnName === selectedDateField;
                }) || {
                    columnName: "",
                    prettyName: ""
                };

                $scope.queryForData();
            };

            /**
             * Adds the node filter with the given value and publishes an add or replace filters event.
             * @param {Object} value
             * @method addFilter
             */
            $scope.addFilter = function(value) {
                $scope.options.selectedNode = "";

                if($scope.filteredNodes.indexOf(value) >= 0) {
                    return;
                }

                $scope.filteredNodes.push(value);

                if($scope.messenger) {
                    var fields = [$scope.options.selectedNodeField.columnName];
                    if($scope.options.selectedLinkField && $scope.options.selectedLinkField.columnName) {
                        fields.push($scope.options.selectedLinkField.columnName);
                    }
                    var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, fields);
                    if($scope.filteredNodes.length === 1) {
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, createFilterClauseForNode, "Graph", $scope.queryForData);
                    } else if($scope.filteredNodes.length > 1) {
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createFilterClauseForNode, "Graph", $scope.queryForData);
                    }
                }
            };

            /**
             * Creates and returns a filter on the given node field using the nodes set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} nodeFieldName The name of the node field on which to filter
             * @method createFilterClauseForNode
             * @private
             * @return {Object} A neon.query.Filter object
             */
            var createFilterClauseForNode = function(databaseAndTableName, fieldNames) {
                var nodeFieldName = fieldNames[0];
                var linkFieldName = fieldNames.length > 1 ? fieldNames[1] : "";

                var nodeClauses = [];
                var linkClauses = [];
                $scope.filteredNodes.forEach(function(filteredNode) {
                    nodeClauses.push(neon.query.where(nodeFieldName, '=', filteredNode));
                    if(linkFieldName) {
                        linkClauses.push(neon.query.where(linkFieldName, '=', filteredNode));
                    }
                });

                var whereClause = nodeClauses.length > 1 ? neon.query.or.apply(neon.query, nodeClauses) : nodeClauses[0];
                if(linkClauses.length) {
                    var otherClause = linkClauses.length > 1 ? neon.query.or.apply(neon.query, linkClauses) : linkClauses[0];
                    whereClause = neon.query.or.apply(neon.query, [whereClause, otherClause]);
                }

                return whereClause;
            };

            /**
             * Removes the node filter with the given value and publishes a remove or replace filters event.
             * @param {Object} value
             * @method removeFilter
             */
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
                        var fields = [$scope.options.selectedNodeField.columnName];
                        if($scope.options.selectedLinkField && $scope.options.selectedLinkField.columnName) {
                            fields.push($scope.options.selectedLinkField.columnName);
                        }
                        var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, fields);
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createFilterClauseForNode, "Graph", $scope.queryForData);
                    }
                }
            };

            /**
             * Removes all of the node filters and publishes a remove filters event.
             * @method clearFilters
             */
            $scope.clearFilters = function() {
                if($scope.filteredNodes.length) {
                    $scope.filteredNodes = [];
                    if($scope.messenger) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                            $scope.queryForData();
                        });
                    }
                }
            };

            /**
             * Queries for new node list and network graph data as requested.
             * @param {Boolean} reloadNetworkGraph Whether to query for the network graph data.  Happens automatically if any node filter(s) are set.
             * @param {Boolean} reloadNodeList Whether to query for the node list data.
             * @method queryForData
             */
            $scope.queryForData = function(reloadNetworkGraph, reloadNodeList) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                $scope.filterableNodes = [];

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.selectedNodeField.columnName || !$scope.filteredNodes.length) {
                    saveDataAndUpdateGraph([], []);
                    $scope.loadingData = false;
                }

                if(connection && $scope.options.selectedNodeField.columnName) {
                    if($scope.filteredNodes.length || reloadNetworkGraph) {
                        queryForNetworkGraph(connection);
                    }

                    if(reloadNodeList) {
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
                    for(var i = 0; i < data.data.length; i++) {
                        var node = data.data[i][$scope.options.selectedNodeField.columnName];
                        if($scope.filterableNodes.indexOf(node) < 0) {
                            $scope.filterableNodes.push(node);
                        }
                    }

                    // Sort the nodes so they are displayed in alphabetical order in the options dropdown.
                    $scope.filterableNodes.sort(function(a, b) {
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
            var queryForNetworkGraph = function(connection) {
                var query = createNetworkGraphQuery();

                connection.executeQuery(query, function(response) {
                    if(response.data.length) {
                        createAndShowGraph(response.data);
                    } else if($scope.filteredNodes.length) {
                        // If the filters cause the query to return no data, remove the most recent filter and query again.  This can happen if the user
                        // creates a filter in the Filter Builder (which the graph automatically adds as a filter) on a node that doesn't exist.
                        $scope.removeFilter($scope.filteredNodes[$scope.filteredNodes.length - 1]);
                    }
                    $scope.loadingData = false;
                }, function(response) {
                    $scope.$apply(function() {
                        saveDataAndUpdateGraph([], []);
                    });
                    $scope.loadingData = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            var createNetworkGraphQuery = function() {
                var fields = [$scope.options.selectedNodeField.columnName];
                if($scope.options.selectedLinkField && $scope.options.selectedLinkField.columnName) {
                    fields.push($scope.options.selectedLinkField.columnName);
                }

                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).withFields(fields).limit($scope.options.dataLimit);

                if($scope.options.selectedDateField && $scope.options.selectedDateField.columnName) {
                    query.sortBy($scope.options.selectedDateField.columnName, neon.query.ASCENDING);
                }

                return query;
            };

            var chooseEarliestDate = function(a, b) {
                if(a && b) {
                    return (a.getTime() <= b.getTime()) ? a : b;
                }
                return a || b;
            };

            /**
             * Creates and shows this visualization's graph using the given data from a query.
             * @param {Array} data
             * @method createAndShowGraph
             * @private
             */
            var createAndShowGraph = function(data) {
                $scope.dataLimited = (data.length >= $scope.options.dataLimit);

                // Maps source node IDs to an array of target node IDs to ensure each link we add to the graph is unique and help with clustering.
                var sourcesToTargets = {};
                // Maps target node IDs to an array of source node IDs to ensure each link we add to the graph is unique and help with clustering.
                var targetsToSources = {};
                // The nodes to be added to the graph.
                var nodes = [];
                // The links to be added to the graph.
                var links = [];

                /**
                 * Adds a node for the given value to the list of nodes if it does not already exist and returns the node.
                 * @param {Object} value
                 * @param {Date} date
                 * @method addNodeIfUnique
                 * @private
                 * @return {Object}
                 */
                var addNodeIfUnique = function(value, date) {
                    var node = _.find(nodes, function(node) {
                        return node.id === value;
                    });

                    if(!node) {
                        node = {
                            id: value,
                            name: value,
                            date: date,
                            size: 0,
                            type: NODE_TYPE,
                            key: createNodeKey(value, NODE_TYPE),
                            group: $scope.filteredNodes.indexOf(value) >= 0 ? QUERIED_NODE_GROUP : UNKNOWN_NODE_GROUP
                        };
                        nodes.push(node);
                    } else {
                        node.date = chooseEarliestDate(node.date, date);
                    }

                    return node;
                };

                /**
                 * Adds a link for the given source and target to the list of links if it does not already exist.
                 * @param {Object} sourceValue
                 * @param {Object} targetValue
                 * @param {Date} date
                 * @method addLinkIfUnique
                 * @private
                 */
                var addLinkIfUnique = function(sourceValue, targetValue, date) {
                    if(!targetsToSources[targetValue]) {
                        targetsToSources[targetValue] = [];
                    }

                    if(targetsToSources[targetValue].indexOf(sourceValue) < 0) {
                        targetsToSources[targetValue].push(sourceValue);
                    }

                    if(!sourcesToTargets[sourceValue]) {
                        sourcesToTargets[sourceValue] = [];
                    }

                    if(sourcesToTargets[sourceValue].indexOf(targetValue) < 0) {
                        sourcesToTargets[sourceValue].push(targetValue);
                        links.push({
                            sourceId: sourceValue,
                            targetId: targetValue,
                            sourceType: NODE_TYPE,
                            targetType: NODE_TYPE,
                            date: date
                        });
                    }
                };

                // Add each unique value from the data to the graph as a node.
                data.forEach(function(row) {
                    var nodeValue = row[$scope.options.selectedNodeField.columnName];
                    var rowDate = ($scope.options.selectedDateField && $scope.options.selectedDateField.columnName) ? new Date(row[$scope.options.selectedDateField.columnName]) : undefined;

                    if(nodeValue) {
                        var node = addNodeIfUnique(nodeValue, rowDate);
                        // Add to size for each instance of the node in the data.
                        node.size++;
                        // Nodes that exist in the data are put in the default group.  Nodes that exist only as linked nodes are put in the unknown group.
                        node.group = (node.group === UNKNOWN_NODE_GROUP ? DEFAULT_NODE_GROUP : node.group);

                        if($scope.options.selectedLinkField && $scope.options.selectedLinkField.columnName && row[$scope.options.selectedLinkField.columnName]) {
                            var linkedNodeValues = row[$scope.options.selectedLinkField.columnName] || [];
                            linkedNodeValues = (linkedNodeValues.constructor === Array) ? linkedNodeValues : [linkedNodeValues];

                            // Add each related node to the graph as a node with a link to the original node.
                            linkedNodeValues.forEach(function(linkedNodeValue) {
                                if(linkedNodeValue && linkedNodeValue !== nodeValue) {
                                    // Nodes for linked nodes start at size 0.  Any instance of the linked node in the data will add to its size.
                                    // If the linked node is not in the data, the size and type will be indicators to the user.
                                    addNodeIfUnique(linkedNodeValue, rowDate);
                                    addLinkIfUnique(linkedNodeValue, nodeValue, rowDate);
                                }
                            });
                        }
                    }
                });

                if(!$scope.filteredNodes.length) {
                    var result = clusterNodes(nodes, links, sourcesToTargets, targetsToSources);
                    nodes = result.nodes;
                    links = result.links;
                }

                sortNodesAndLinks(nodes, links);

                $scope.$apply(function() {
                    saveDataAndUpdateGraph(nodes, links);
                });
            };

            var createNodeKey = function(id, type) {
                return type + "." + id;
            };

            var createLinkKey = function(sourceId, sourceType, targetId, targetType) {
                return createNodeKey(sourceId, sourceType) + "-" + createNodeKey(targetId, targetType);
            };

            /**
             * Creates clusters for nodes in the given array as appropriate and returns an object containing the new arrays of nodes and links.
             * @param {Array} nodes
             * @param {Array} links
             * @param {Object} sourcesToTargets
             * @param {Object} targetsToSources
             * @method clusterNodes
             * @private
             * @return {Object}
             */
            var clusterNodes = function(nodes, links, sourcesToTargets, targetsToSources) {
                // The node and link lists that will be returned.
                var resultNodes = [];
                var resultLinks = links;

                var nextFreeClusterId = 1;
                var sourcesToClusterTargets = {};
                var targetsToClusterSources = {};

                // The cluster for all nodes that are not linked to any other nodes.
                var unlinkedCluster = {
                    id: 0,
                    type: CLUSTER_TYPE,
                    key: createNodeKey(0, CLUSTER_TYPE),
                    group: CLUSTER_NODE_GROUP,
                    nodes: []
                };

                /**
                 * Returns whether to cluster the node linked to the node with the given ID based on whether the cluster to be created would contain more than one node.
                 * @param {Number} id The ID of the node linked to the node in question.
                 * @param {Object} map The mapping from the given ID to the node in question.
                 * @param {Object} reverseMap The reverse mapping.
                 * @method shouldCluster
                 * @private
                 * @return {Boolean}
                 */
                var shouldCluster = function(id, map, reverseMap) {
                    // Check if the linked node itself has other linked nodes.  If not, the node in question should not be clustered.
                    if(map[id] && map[id].length > 1) {
                        // Check if the cluster would contain more than one node.  If not, the node in question should not be clustered.
                        return map[id].filter(function(otherId) {
                            return reverseMap[otherId].length === 1;
                        }).length > 1;
                    }
                    return false;
                };

                /**
                 * Adds a new cluster node to the list of nodes using the given node IDs or adds a node to an existing cluster node.  Returns the ID of the cluster node.
                 * Either sourceId or targetId should be undefined (but not both).
                 * @param {Number} clusterId The ID of the cluster node, or undefined if a new cluster node should be created.
                 * @param {Number} sourceId The ID of the source node linked to the cluster node, or undefined if the cluster node is the source.
                 * @param {Number} targetId the ID of the target node linked to the cluster node, or undefined if the cluster node is the target.
                 * @param {Object} nodeToCluster The node to add to the cluster.
                 * @method addCluster
                 * @private
                 * @return {Number}
                 */
                var addCluster = function(clusterId, sourceId, targetId, nodeToCluster) {
                    if(!clusterId) {
                        clusterId = nextFreeClusterId++;
                        // Create a new link between the cluster node and the other node.  Use the cluster node ID as the source/target ID for the link.
                        resultLinks.push({
                            sourceId: sourceId || clusterId,
                            targetId: targetId || clusterId,
                            sourceType: sourceId ? NODE_TYPE : CLUSTER_TYPE,
                            targetType: targetId ? NODE_TYPE : CLUSTER_TYPE,
                            date: nodeToCluster.date
                        });

                        // Create a new cluster node and add it to the list of nodes.
                        resultNodes.push({
                            id: clusterId,
                            date: nodeToCluster.date,
                            type: CLUSTER_TYPE,
                            key: createNodeKey(clusterId, CLUSTER_TYPE),
                            group: CLUSTER_NODE_GROUP,
                            nodes: [nodeToCluster]
                        });
                    } else {
                        resultLinks.push({
                            sourceId: sourceId || clusterId,
                            targetId: targetId || clusterId,
                            sourceType: sourceId ? NODE_TYPE : CLUSTER_TYPE,
                            targetType: targetId ? NODE_TYPE : CLUSTER_TYPE,
                            date: nodeToCluster.date
                        });

                        // Add the node to the existing cluster.
                        var cluster = _.find(resultNodes, function(node) {
                            return node.type === CLUSTER_TYPE && node.id === clusterId;
                        });
                        cluster.nodes.push(nodeToCluster);
                        cluster.date = chooseEarliestDate(cluster.date, nodeToCluster.date);
                    }
                    return clusterId;
                };

                nodes.forEach(function(node) {
                    var numberOfTargets = sourcesToTargets[node.id] ? sourcesToTargets[node.id].length : 0;
                    var numberOfSources = targetsToSources[node.id] ? targetsToSources[node.id].length : 0;

                    // If the node is an unknown type or has more than one link, keep it; otherwise, add it to a cluster.
                    if($scope.filteredNodes.indexOf(node.id) >= 0 || node.type === UNKNOWN_NODE_GROUP || numberOfTargets > 1 || numberOfSources > 1 || (numberOfTargets === 1 && numberOfSources === 1)) {
                        resultNodes.push(node);
                    } else if(numberOfTargets === 1) {
                        var targetId = sourcesToTargets[node.id][0];
                        if(shouldCluster(targetId, targetsToSources, sourcesToTargets)) {
                            targetsToClusterSources[targetId] = addCluster(targetsToClusterSources[targetId], null, targetId, node);
                        } else {
                            resultNodes.push(node);
                        }
                    } else if(numberOfSources === 1) {
                        var sourceId = targetsToSources[node.id][0];
                        if(shouldCluster(sourceId, sourcesToTargets, targetsToSources)) {
                            sourcesToClusterTargets[sourceId] = addCluster(sourcesToClusterTargets[sourceId], sourceId, null, node);
                        } else {
                            resultNodes.push(node);
                        }
                    } else {
                        // If the node has no links, add it to the cluster node for unlinked nodes.
                        unlinkedCluster.nodes.push(node);
                        unlinkedCluster.date = chooseEarliestDate(unlinkedCluster.date, node.date);
                    }
                });

                if(unlinkedCluster.nodes.length) {
                    resultNodes.push(unlinkedCluster);
                }

                return {
                    nodes: resultNodes,
                    links: resultLinks
                };
            };

            /**
             * Sorts the given lists of nodes and links by date.  Nodes and links with undefined dates will be in front.
             * @param nodes
             * @param links
             * @method sortNodesAndLinks
             * @private
             */
            var sortNodesAndLinks = function(nodes, links) {
                var compareNodesOrLinksByDate = function(a, b) {
                    if(!a.date) {
                        return -1;
                    }
                    if(!b.date) {
                        return 1;
                    }
                    return (a.date.getTime() <= b.date.getTime()) ? -1 : 1;
                };

                nodes.sort(compareNodesOrLinksByDate);
                links.sort(compareNodesOrLinksByDate);
            };

            /**
             * Returns the array of links containing indices for the source and target nodes using the given list of nodes and links containing source and target node IDs.
             * @param {Array} nodes
             * @param {Array} links
             * @method createIndexLinks
             * @private
             * @return {Array}
             */
            var createIndexLinks = function(nodes, links) {
                var indexLinks = [];

                links.forEach(function(link) {
                    var sourceIndex = _.findIndex(nodes, function(node) {
                        return node.id === link.sourceId && node.type === link.sourceType;
                    });
                    var targetIndex = _.findIndex(nodes, function(node) {
                        return node.id === link.targetId && node.type === link.targetType;
                    });

                    if(sourceIndex >= 0 && targetIndex >= 0) {
                        indexLinks.push({
                            source: sourceIndex,
                            target: targetIndex,
                            date: link.date,
                            size: 2,
                            key: createLinkKey(link.sourceId, link.sourceType, link.targetId, link.targetType)
                        });
                    }
                });

                return indexLinks;
            };

            /**
             * Saves the given nodes and links and updates this visualization's network graph using the data.
             * @param {Array} nodes
             * @param {Array} links
             * @method saveDataAndUpdateGraph
             * @private
             */
            var saveDataAndUpdateGraph = function(nodes, links) {
                $scope.numberOfVisibleNodes = nodes.length;
                $scope.graphNodes = nodes;
                // Convert links connecting node values to links connecting node indices.
                $scope.graphLinks = createIndexLinks(nodes, links);
                initializeDateBuckets();

                $scope.graph.updateGraph({
                    nodes: $scope.graphNodes,
                    links: $scope.graphLinks
                });
            };

            /**
             * Initializes the global date bucket maps for the global node and link data using the global bucketizer.
             * @method initializeDateBuckets
             * @private
             */
            var initializeDateBuckets = function() {
                $scope.dateBucketToNodeIndex = createDateBucketMap($scope.graphNodes.length);
                $scope.dateBucketToLinkIndex = createDateBucketMap($scope.graphLinks.length);

                if($scope.bucketizer && $scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
                    $scope.graphNodes.forEach(function(node, index) {
                        var bucket = node.date ? $scope.bucketizer.getBucketIndex(node.date) : 0;
                        $scope.dateBucketToNodeIndex[bucket] = index + 1;

                        // If the node is a cluster containing its own nodes, create a date bucket map for the cluster.
                        if(node.nodes) {
                            node.dateBucketToNodeIndex = createDateBucketMap(node.nodes.length);
                            node.nodes.forEach(function(clusteredNode, clusteredIndex) {
                                var bucket = clusteredNode.date ? $scope.bucketizer.getBucketIndex(clusteredNode.date) : 0;
                                node.dateBucketToNodeIndex[bucket] = clusteredIndex + 1;
                            });
                            node.nodesForSelectedDateBucket = node.nodes;
                        }
                    });

                    $scope.graphLinks.forEach(function(link, index) {
                        var bucket = link.date ? $scope.bucketizer.getBucketIndex(link.date) : 0;
                        $scope.dateBucketToLinkIndex[bucket] = index + 1;
                    });
                }
            };

            /**
             * Creates and returns a map containing keys for each date bucket in the global bucketizer.
             * @param {Number} length The length of the list used with the date bucket map to be created.
             * @method createDateBucketMap
             * @private
             * @return {Object}
             */
            var createDateBucketMap = function(length) {
                var dateBucketMap = {};

                if($scope.bucketizer && $scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
                    var numberOfBuckets = $scope.bucketizer.getNumBuckets();
                    for(var i = 0; i < numberOfBuckets; ++i) {
                        dateBucketMap[i] = length;
                    }
                }

                return dateBucketMap;
            };

            /**
             * Returns the size for the given node.
             * @param {Object} node
             * @method calculateNodeSize
             * @private
             */
            var calculateNodeSize = function(node) {
                if(node.type === CLUSTER_TYPE) {
                    var nodesInCluster = $scope.selectedDateBucket ? node.nodesForSelectedDateBucket : node.nodes;
                    var size = 0;
                    nodesInCluster.forEach(function(nodeInCluster) {
                        size += nodeInCluster.size;
                    });
                    return 10 + Math.min(20, Math.floor(size / 5));
                }

                return 10 + Math.min(20, Math.floor(node.size / 5));
            };

            /**
             * Returns the color for the given node.
             * @param {Object} node
             * @method calculateNodeColor
             * @private
             */
            var calculateNodeColor = function(node) {
                if(node.group === QUERIED_NODE_GROUP) {
                    return QUERIED_NODE_COLOR;
                }
                if(node.group === CLUSTER_NODE_GROUP) {
                    return CLUSTER_NODE_COLOR;
                }
                if(node.group === UNKNOWN_NODE_GROUP) {
                    return UNKNOWN_NODE_COLOR;
                }
                return DEFAULT_NODE_COLOR;
            };

            /**
             * Returns the text for the given node.
             * @param {Object} node
             * @method createNodeText
             * @private
             */
            var createNodeText = function(node) {
                if(node.type === CLUSTER_TYPE) {
                    var nodesInCluster = $scope.selectedDateBucket ? node.nodesForSelectedDateBucket : node.nodes;
                    return nodesInCluster.length;
                }
                return "";
            };

            /**
             * Returns the tooltip for the given node.
             * @param {Object} node
             * @method createNodeTooltip
             * @private
             */
            var createNodeTooltip = function(node) {
                if(node.type === CLUSTER_TYPE) {
                    var nodesInCluster = $scope.selectedDateBucket ? node.nodesForSelectedDateBucket : node.nodes;
                    var text = "<div>Cluster of " + nodesInCluster.length + ":</div><ul>";
                    nodesInCluster.forEach(function(nodeInCluster) {
                        text += "<li>" + createNodeTooltip(nodeInCluster) + "</li>";
                    });
                    return text;
                }
                return "<div>" + node.name + "</div><div>Count:  " + node.size + "</div>";
            };

            /**
             * Returns the size for the given link.
             * @param {Object} link
             * @method calculateLinkSize
             * @private
             */
            var calculateLinkSize = function(link) {
                return link.size;
            };

            /**
             * Returns the key for the given node.
             * @param {Object} node
             * @method getNodeKey
             * @private
             */
            var getNodeKey = function(node) {
                return node.key;
            };

            /**
             * Returns the key for the given link.
             * @param {Object} link
             * @method getLinkKey
             * @private
             */
            var getLinkKey = function(link) {
                return link.key;
            };

            /**
             * Adds or removes a filter on the given node.
             * @param {Object} node
             * @method onNodeClicked
             * @private
             */
            var onNodeClicked = function(node) {
                if(node.type === CLUSTER_TYPE) {
                    return;
                }

                if($scope.filteredNodes.indexOf(node.name) >= 0) {
                    $scope.$apply(function() {
                        $scope.removeFilter(node.name);
                    });
                } else {
                    $scope.$apply(function() {
                        $scope.addFilter(node.name);
                    });
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
                var query = createNetworkGraphQuery();
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
                initialize();
                displayActiveDataset(true);
            });
        }
    };
}]);
