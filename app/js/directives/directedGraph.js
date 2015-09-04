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
.directive('directedGraph', ['$filter', '$timeout', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'ExportService',
function($filter, $timeout, connectionService, datasetService, errorNotificationService, exportService) {
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
            var CLUSTER_NODE_GROUP = "cluster";
            var MISSING_NODE_GROUP = "missing";

            // Color codes copied from d3.scale.category10().
            var DEFAULT_COLOR = "#1f77b4"; // blue
            var CLUSTER_COLOR = "#9467bd"; // purple
            var MISSING_COLOR = "#d62728"; // red
            var FOCUSED_COLOR = "#2ca02c"; // green

            // Name for the arrowhead marker with the focused color.
            var FOCUSED_COLOR_ARROWHEAD = "focused";

            $scope.TIMEOUT_MS = 250;

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.numberOfVisibleNodes = 0;
            $scope.dataLimited = false;
            $scope.databaseNodeValues = [];
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.bucketizer = dateBucketizer();
            $scope.outstandingNodeQuery = undefined;
            $scope.outstandingGraphQuery = undefined;

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
            $scope.dateBucketsToNodeIndices = {};
            $scope.dateBucketsToLinkIndices = {};
            $scope.selectedDateBucket = undefined;
            $scope.mouseoverNetworkId = undefined;
            $scope.selectedNetworkIds = [];
            $scope.nodeValuesToNetworkIds = {};

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
             * Selects the network of the node in the graph with the given value.
             * @param {Object} selectedValue
             * @method selectNodeNetworkFromValue
             */
            $scope.selectNodeNetworkFromValue = function(selectedValue) {
                if(selectedValue !== "" && $scope.graph) {
                    var value = Number(selectedValue) ? Number(selectedValue) : selectedValue;

                    if($scope.nodeValuesToNetworkIds[value] !== undefined) {
                        var index = $scope.selectedNetworkIds.indexOf($scope.nodeValuesToNetworkIds[value]);
                        if(index >= 0) {
                            $scope.selectedNetworkIds.splice(index, 1);
                        } else {
                            $scope.selectedNetworkIds.push($scope.nodeValuesToNetworkIds[value]);
                        }
                        $scope.graph.redrawNodesAndLinks();
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
                            selectNodeNetworkFromWhereClause(message.addedFilter.whereClause);
                        }
                        reloadNetworkGraph = $scope.options.reloadOnFilter;
                    }
                    $scope.queryForData(reloadNetworkGraph);
                }
            };

            /**
             * Selects the networks for the nodes with values in the given where clause (and its children) if their fields match the selected node or link fields.
             * @param {Object} A where clause containing either {String} lhs and {String} rhs or {Array} whereClauses containing other where clause Objects.
             * @method selectNodeNetworkFromWhereClause
             * @private
             */
            var selectNodeNetworkFromWhereClause = function(whereClause) {
                if(whereClause.whereClauses) {
                    for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                        selectNodeNetworkFromWhereClause(whereClause.whereClauses[i]);
                    }
                } else if(whereClause.lhs === $scope.options.selectedNodeField.columnName && whereClause.lhs && whereClause.rhs) {
                    $scope.selectNodeNetworkFromValue(whereClause.rhs);
                } else if($scope.options.selectedLinkField && whereClause.lhs === $scope.options.selectedLinkField.columnName && whereClause.lhs && whereClause.rhs) {
                    $scope.selectNodeNetworkFromValue(whereClause.rhs);
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

                        nodes = $scope.graphNodes.slice(0, $scope.dateBucketsToNodeIndices[bucket]);
                        nodes.forEach(function(node) {
                            if(node.dateBucketsToNodeIndices && node.nodes) {
                                node.nodesForSelectedDateBucket = node.nodes.slice(0, node.dateBucketsToNodeIndices[bucket]);
                            }
                        });

                        links = $scope.graphLinks.slice(0, $scope.dateBucketsToLinkIndices[bucket]);
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
                        getNodeOpacity: calculateNodeOpacity,
                        getNodeText: createNodeText,
                        getNodeTooltip: createNodeTooltip,
                        getLinkSize: calculateLinkSize,
                        getLinkColor: calculateLinkColor,
                        getLinkOpacity: calculateLinkOpacity,
                        getLinkArrowhead: getLinkArrowhead,
                        getLinkTooltip: createLinkTooltip,
                        getNodeKey: getNodeKey,
                        getLinkKey: getLinkKey,
                        nodeMouseoverHandler: onNodeSelect,
                        nodeMouseoutHandler: onNodeDeselect,
                        nodeClickHandler: onNodeClick,
                        linkMouseoverHandler: onLinkSelect,
                        linkMouseoutHandler: onLinkDeselect,
                        linkClickHandler: onLinkClick
                    });
                    $scope.graph.createArrowhead(FOCUSED_COLOR_ARROWHEAD, FOCUSED_COLOR, $scope.graph.DEFAULT_LINK_STROKE_OPACITY);
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];

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
             * Queries for new node list and network graph data as requested.
             * @param {Boolean} reloadNetworkGraph Whether to query for the network graph data.
             * @param {Boolean} reloadNodeList Whether to query for the node list data.
             * @method queryForData
             */
            $scope.queryForData = function(reloadNetworkGraph, reloadNodeList) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                $scope.mouseoverNetworkId = undefined;
                $scope.selectedNetworkIds = [];
                $scope.databaseNodeValues = [];

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.selectedNodeField.columnName || (!reloadNetworkGraph && !reloadNodeList)) {
                    saveDataAndUpdateGraph([], []);
                    $scope.loadingData = false;
                    return;
                }

                if(reloadNetworkGraph) {
                    queryForNetworkGraph(connection);
                }

                if(reloadNodeList) {
                    queryForNodeList(connection);
                }
            };

            /**
             * Query for the list of nodes using the selected field but do not draw a graph.
             */
            var queryForNodeList = function(connection) {
                var query = createNodeListQuery();
                console.log("query for node list");

                if($scope.outstandingNodeQuery) {
                    $scope.outstandingNodeQuery.abort();
                }

                $scope.outstandingNodeQuery = connection.executeQuery(query).xhr.done(function(data) {
                    $scope.outstandingNodeQuery = undefined;
                    for(var i = 0; i < data.data.length; i++) {
                        var node = data.data[i][$scope.options.selectedNodeField.columnName];
                        if($scope.databaseNodeValues.indexOf(node) < 0) {
                            $scope.databaseNodeValues.push(node);
                        }
                    }

                    // Sort the nodes so they are displayed in alphabetical order in the options dropdown.
                    $scope.databaseNodeValues.sort(function(a, b) {
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
                }).fail(function(response) {
                    $scope.outstandingNodeQuery = undefined;
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
                    .aggregate(neon.query.COUNT, '*', 'count');

                return query;
            };

            /**
             * Query for the list of nodes that link to the filtered nodes and draw the graph containing the network.
             */
            var queryForNetworkGraph = function(connection) {
                var query = createNetworkGraphQuery();

                if($scope.outstandingGraphQuery) {
                    $scope.outstandingGraphQuery.abort();
                }

                $scope.outstandingGraphQuery = connection.executeQuery(query).xhr.done(function(response) {
                    $scope.outstandingGraphQuery = undefined;
                    if(response.data.length) {
                        createAndShowGraph(response.data);
                    }
                    $scope.loadingData = false;
                }).fail(function(response) {
                    $scope.outstandingGraphQuery = undefined;
                    if(response.status !== 0) {
                        $scope.$apply(function() {
                            saveDataAndUpdateGraph([], []);
                        });
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
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
                 * @param {Number} or {String} value
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
                        node = createNode(value, NODE_TYPE, MISSING_NODE_GROUP, date);
                        nodes.push(node);
                    } else {
                        node.date = chooseEarliestDate(node.date, date);
                    }

                    return node;
                };

                /**
                 * Adds a link for the given source and target to the list of links if it does not already exist.
                 * @param {Number} or {String} sourceValue
                 * @param {Number} or {String} targetValue
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
                        links.push(createLink(sourceValue, NODE_TYPE, targetValue, NODE_TYPE, date));
                    } else {
                        var link = _.find(links, function(link) {
                            return link.sourceId === sourceValue && link.targetId === targetValue;
                        });
                        link.date = chooseEarliestDate(link.date, date);
                        link.size++;
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
                        // Nodes that exist in the data are put in the default group.  Nodes that exist only as linked nodes are put in the missing group.
                        node.group = (node.group === MISSING_NODE_GROUP ? DEFAULT_NODE_GROUP : node.group);

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

                $scope.nodeValuesToNetworkIds = {};

                // TODO Add an option to avoid clustering the nodes.
                var result = clusterNodes(nodes, links, sourcesToTargets, targetsToSources);
                nodes = result.nodes;
                links = result.links;

                sortNodesAndLinks(nodes, links);

                $scope.$apply(function() {
                    saveDataAndUpdateGraph(nodes, links);
                });
            };

            /**
             * Creates and returns a new node for the graph.
             * @param {Number} or {String} value
             * @param {Number} or {String} type
             * @param {Number} or {String} group
             * @param {Date} date
             * @method createNode
             * @private
             * @return {Object}
             */
            var createNode = function(value, type, group, date) {
                return {
                    id: value,
                    date: date,
                    group: group,
                    name: value,
                    network: 0,
                    size: 0,
                    type: type,
                    //x: 0,
                    //y: 0,
                    key: createNodeKey(value, type)
                };
            };

            /**
             * Creates and returns a unique node key using the given node ID and type.
             * @param {Number} or {String} id
             * @param {Number} or {String} type
             * @method createNodeKey
             * @private
             * @return {String}
             */
            var createNodeKey = function(id, type) {
                return type + "." + id;
            };

            /**
             * Creates and returns a new link connecting two nodes with the given values.
             * @param {Number} or {String} sourceValue
             * @param {Number} or {String} sourceType
             * @param {Number} or {String} targetValue
             * @param {Number} or {String} targetType
             * @method createLink
             * @private
             * @return {Object}
             */
            var createLink = function(sourceValue, sourceType, targetValue, targetType, date) {
                return {
                    sourceId: sourceValue,
                    targetId: targetValue,
                    sourceType: sourceType,
                    targetType: targetType,
                    date: date,
                    size: 1
                };
            };

            /**
             * Creates and returns a unique link key using the given node IDs and types.
             * @param {Number} or {String} sourceId
             * @param {Number} or {String} targetId
             * @param {Number} or {String} sourceType
             * @param {Number} or {String} targetType
             * @method createLinkKey
             * @private
             * @return {String}
             */
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
                var unlinkedCluster = createNode(0, CLUSTER_TYPE, CLUSTER_NODE_GROUP);
                unlinkedCluster.nodes = [];

                /**
                 * Adds a new cluster node to the list of nodes using the given node IDs or adds a node to an existing cluster node.  Returns the ID of the cluster node.
                 * Either sourceId or targetId should be undefined (but not both).
                 * @param {Number} clusterId The ID of the cluster node, or undefined if a new cluster node should be created.
                 * @param {Number} or {String} sourceId The ID of the source node linked to the cluster node, or undefined if the cluster node is the source.
                 * @param {Number} or {String} targetId the ID of the target node linked to the cluster node, or undefined if the cluster node is the target.
                 * @param {Object} nodeToCluster The node to add to the cluster.
                 * @method addCluster
                 * @private
                 * @return {Number}
                 */
                var addCluster = function(clusterId, sourceId, targetId, nodeToCluster) {
                    if(!clusterId) {
                        clusterId = nextFreeClusterId++;
                        // Create a new cluster node and add it to the list of nodes.
                        var cluster = createNode(clusterId, CLUSTER_TYPE, CLUSTER_NODE_GROUP, nodeToCluster.date);
                        cluster.nodes = [nodeToCluster];
                        resultNodes.push(cluster);
                    } else {
                        // Add the node to the existing cluster.
                        var cluster = _.find(resultNodes, function(node) {
                            return node.type === CLUSTER_TYPE && node.id === clusterId;
                        });
                        cluster.nodes.push(nodeToCluster);
                        cluster.date = chooseEarliestDate(cluster.date, nodeToCluster.date);
                    }

                    // Create a new link between the cluster node and the other node.  Use the cluster node ID as the source/target ID for the link.
                    resultLinks.push(createLink((sourceId || clusterId), (sourceId ? NODE_TYPE : CLUSTER_TYPE), (targetId || clusterId), (targetId ? NODE_TYPE : CLUSTER_TYPE), nodeToCluster.date));
                    return clusterId;
                };

                nodes.forEach(function(node) {
                    var numberOfTargets = sourcesToTargets[node.id] ? sourcesToTargets[node.id].length : 0;
                    var numberOfSources = targetsToSources[node.id] ? targetsToSources[node.id].length : 0;

                    // If the node is a missing type or has more than one link, keep it; otherwise, add it to a cluster.
                    if(node.type === MISSING_NODE_GROUP || numberOfTargets > 1 || numberOfSources > 1 || (numberOfTargets === 1 && numberOfSources === 1)) {
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
                        $scope.nodeValuesToNetworkIds[node.id] = 0;
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
             * Returns whether to cluster the node linked to the node with the given ID based on whether the cluster to be created would contain more than one node.
             * @param {Number} or {String} id The ID of the node linked to the node in question.
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
             * Sets the network IDs for the given nodes.  Creates and returns the array of links containing indices for the source and target nodes using the
             * given list of nodes and links containing source and target node IDs.
             * @param {Array} nodes
             * @param {Array} links
             * @method finalizeNetworksAndCreateLinks
             * @private
             * @return {Array}
             */
            var finalizeNetworksAndCreateLinks = function(nodes, links) {
                // While the input links connect source node value to target node value, D3 links must connect source node index to target node index.
                var indexLinks = [];

                var nextFreeNetworkId = 1;

                links.forEach(function(link) {
                    var sourceIndex = _.findIndex(nodes, function(node) {
                        return node.id === link.sourceId && node.type === link.sourceType;
                    });
                    var targetIndex = _.findIndex(nodes, function(node) {
                        return node.id === link.targetId && node.type === link.targetType;
                    });

                    if(sourceIndex >= 0 && targetIndex >= 0) {
                        var sourceNode = nodes[sourceIndex];
                        var targetNode = nodes[targetIndex];
                        if(!sourceNode.network && !targetNode.network) {
                            var networkId = nextFreeNetworkId++;
                            setNodeNetworkId(sourceNode, networkId);
                            setNodeNetworkId(targetNode, networkId);
                        } else if(!sourceNode.network) {
                            setNodeNetworkId(sourceNode, targetNode.network);
                        } else if(!targetNode.network) {
                            setNodeNetworkId(targetNode, sourceNode.network);
                        } else if(sourceNode.network !== targetNode.network) {
                            var oldNetworkId = targetNode.network;
                            nodes.forEach(function(node) {
                                if(node.network === oldNetworkId) {
                                    setNodeNetworkId(node, sourceNode.network);
                                }
                            });
                            indexLinks.forEach(function(indexLink) {
                                if(indexLink.network === oldNetworkId) {
                                    indexLink.network = sourceNode.network;
                                }
                            });
                        }

                        saveValueToNetworkIdMapping(sourceNode);
                        saveValueToNetworkIdMapping(targetNode);

                        if(link.size > 1) {
                            console.log(link.size + " for " + link.sourceId + " -> " + link.targetId);
                        }

                        indexLinks.push({
                            source: sourceIndex,
                            target: targetIndex,
                            date: link.date,
                            size: link.size,
                            network: sourceNode.network,
                            key: createLinkKey(link.sourceId, link.sourceType, link.targetId, link.targetType)
                        });
                    }
                });

                return indexLinks;
            };

            /**
             * Sets the network ID for the given node.  If the node is a cluster, also sets the network ID for all nodes in the cluster.
             * @param {Object} node
             * @param {Number} networkId
             * @method setNodeNetworkId
             * @private
             */
            var setNodeNetworkId = function(node, networkId) {
                node.network = networkId;
                if(node.type === CLUSTER_TYPE) {
                    node.nodes.forEach(function(nodeInCluster) {
                        setNodeNetworkId(nodeInCluster, networkId);
                    });
                }
            };

            /**
             * Saves the value to network ID mapping of the given node in the global map.  If the node is a cluster, also saves the mappings for all nodes in the cluster.
             * @param {Object} node
             * @method saveValueToNetworkIdMapping
             * @private
             */
            var saveValueToNetworkIdMapping = function(node) {
                if(node.type === CLUSTER_TYPE) {
                    node.nodes.forEach(function(nodeInCluster) {
                        saveValueToNetworkIdMapping(nodeInCluster);
                    });
                } else {
                    $scope.nodeValuesToNetworkIds[node.id] = node.network;
                }
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
                // Sets the node/link network IDs and transforms links connecting node values to links connecting node indices.
                $scope.graphLinks = finalizeNetworksAndCreateLinks(nodes, links);
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
                $scope.dateBucketsToNodeIndices = createDateBucketMap($scope.graphNodes.length);
                $scope.dateBucketsToLinkIndices = createDateBucketMap($scope.graphLinks.length);

                if($scope.bucketizer && $scope.bucketizer.getStartDate() && $scope.bucketizer.getEndDate()) {
                    $scope.graphNodes.forEach(function(node, index) {
                        var bucket = node.date ? $scope.bucketizer.getBucketIndex(node.date) : 0;
                        $scope.dateBucketsToNodeIndices[bucket] = index + 1;

                        // If the node is a cluster containing its own nodes, create a date bucket map for the cluster.
                        if(node.type === CLUSTER_TYPE) {
                            node.dateBucketsToNodeIndices = createDateBucketMap(node.nodes.length);
                            node.nodes.forEach(function(nodeInCluster, indexInCluster) {
                                var bucket = nodeInCluster.date ? $scope.bucketizer.getBucketIndex(nodeInCluster.date) : 0;
                                node.dateBucketsToNodeIndices[bucket] = indexInCluster + 1;
                            });
                            node.nodesForSelectedDateBucket = node.nodes;
                        }
                    });

                    $scope.graphLinks.forEach(function(link, index) {
                        var bucket = link.date ? $scope.bucketizer.getBucketIndex(link.date) : 0;
                        $scope.dateBucketsToLinkIndices[bucket] = index + 1;
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
             * @return {Number}
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
             * @return {String}
             */
            var calculateNodeColor = function(node) {
                if($scope.mouseoverNetworkId === node.network || $scope.selectedNetworkIds.indexOf(node.network) >= 0) {
                    return FOCUSED_COLOR;
                }
                if(node.group === CLUSTER_NODE_GROUP) {
                    return CLUSTER_COLOR;
                }
                if(node.group === MISSING_NODE_GROUP) {
                    return MISSING_COLOR;
                }
                return DEFAULT_COLOR;
            };

            /**
             * Returns the opacity for the given node.
             * @param {Object} node
             * @method calculateNodeOpacity
             * @private
             * @return {Number}
             */
            var calculateNodeOpacity = function(node) {
                if($scope.mouseoverNetworkId === node.network || $scope.selectedNetworkIds.indexOf(node.network) >= 0) {
                    return $scope.graph.DEFAULT_NODE_OPACITY;
                } else if($scope.mouseoverNetworkId || $scope.selectedNetworkIds.length) {
                    return $scope.graph.DEFAULT_NODE_OPACITY / 2.0;
                }
                return $scope.graph.DEFAULT_NODE_OPACITY;
            };

            /**
             * Returns the text for the given node.
             * @param {Object} node
             * @method createNodeText
             * @private
             * @return {String}
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
             * @return {String}
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
             * @return {Number}
             */
            var calculateLinkSize = function(link) {
                return 2 + Math.min(8, Math.floor(link.size / 5));
            };

            /**
             * Returns the color for the given link.
             * @param {Object} link
             * @method calculateLinkColor
             * @private
             * @return {String}
             */
            var calculateLinkColor = function(link) {
                if($scope.mouseoverNetworkId === link.network || $scope.selectedNetworkIds.indexOf(link.network) >= 0) {
                    return FOCUSED_COLOR;
                }
                return $scope.graph.DEFAULT_LINK_STROKE_COLOR;
            };

            /**
             * Returns the opacity for the given link.
             * @param {Object} link
             * @method calculateLinkOpacity
             * @private
             * @return {Number}
             */
            var calculateLinkOpacity = function(link) {
                return $scope.graph.DEFAULT_LINK_STROKE_OPACITY;
            };

            /**
             * Returns the name of the arrowhead marker for the given link.
             * @param {Object} link
             * @method getLinkArrowhead
             * @private
             * @return {String}
             */
            var getLinkArrowhead = function(link) {
                if($scope.mouseoverNetworkId === link.network || $scope.selectedNetworkIds.indexOf(link.network) >= 0) {
                    return FOCUSED_COLOR_ARROWHEAD;
                }
                return $scope.graph.DEFAULT_LINK_ARROWHEAD;
            };

            /**
             * Returns the tooltip for the given link.
             * @param {Object} link
             * @method createLinkTooltip
             * @private
             * @return {String}
             */
            var createLinkTooltip = function(link) {
                return "<div>Count:  " + link.size + "</div>";
            };

            /**
             * Returns the key for the given node.
             * @param {Object} node
             * @method getNodeKey
             * @private
             * @return {String}
             */
            var getNodeKey = function(node) {
                return node.key;
            };

            /**
             * Returns the key for the given link.
             * @param {Object} link
             * @method getLinkKey
             * @private
             * @return {String}
             */
            var getLinkKey = function(link) {
                return link.key;
            };

            /**
             * Selects the network for the given node if it is not selected.
             * @param {Object} node
             * @method onNodeSelect
             * @private
             */
            var onNodeSelect = function(node) {
                $scope.mouseoverNetworkId = node.network;
                $scope.graph.redrawNodesAndLinks();
            };

            /**
             * Deselects the network for the given node if it is selected.
             * @param {Object} node
             * @method onNodeDeselect
             * @private
             */
            var onNodeDeselect = function(node) {
                $scope.mouseoverNetworkId = undefined;
                $scope.graph.redrawNodesAndLinks();
            };

            /**
             * Selects or deselects the network for the given node.
             * @param {Object} node
             * @method onNodeClick
             * @private
             */
            var onNodeClick = function(node) {
                var index = $scope.selectedNetworkIds.indexOf(node.network);
                if(index >= 0) {
                    $scope.selectedNetworkIds.splice(index, 1);
                } else {
                    $scope.selectedNetworkIds.push(node.network);
                }
                $scope.graph.redrawNodesAndLinks();
            };

            /**
             * Selects the network for the given link if it is not selected.
             * @param {Object} link
             * @method onLinkSelect
             * @private
             */
            var onLinkSelect = function(link) {
                $scope.mouseoverNetworkId = link.network;
                $scope.graph.redrawNodesAndLinks();
            };

            /**
             * Deselects the network for the given link if it is selected.
             * @param {Object} link
             * @method onLinkDeselect
             * @private
             */
            var onLinkDeselect = function(link) {
                $scope.mouseoverNetworkId = undefined;
                $scope.graph.redrawNodesAndLinks();
            };

            /**
             * Selects or deselects the network for the given link.
             * @param {Object} link
             * @method onLinkClick
             * @private
             */
            var onLinkClick = function(link) {
                var index = $scope.selectedNetworkIds.indexOf(link.network);
                if(index >= 0) {
                    $scope.selectedNetworkIds.splice(index, 1);
                } else {
                    $scope.selectedNetworkIds.push(link.network);
                }
                $scope.graph.redrawNodesAndLinks();
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
