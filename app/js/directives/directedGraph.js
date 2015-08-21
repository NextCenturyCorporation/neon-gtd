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
                nodeLimit: 5000,
                reloadOnFilter: false
            };

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
                    var value = Number($scope.options.selectedNode) ? Number($scope.options.selectedNode) : $scope.options.selectedNode;

                    if($scope.filteredNodes.indexOf(value) < 0) {
                        $scope.addFilter(value);
                    }
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
                    var reloadNetworkGraph = false;
                    if(message.type.toUpperCase() === "ADD" || message.type.toUpperCase() === "REPLACE") {
                        if(message.addedFilter.whereClause) {
                            $scope.addFilterWhereClauseToFilterList(message.addedFilter.whereClause);
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
             */
            $scope.addFilterWhereClauseToFilterList = function(whereClause) {
                if(whereClause.whereClauses) {
                    for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                        $scope.addFilterWhereClauseToFilterList(whereClause.whereClauses[i]);
                    }
                } else if(whereClause.lhs === $scope.options.selectedNodeField.columnName && whereClause.lhs && whereClause.rhs) {
                    $scope.addFilter(whereClause.rhs);
                } else if($scope.options.selectedLinkField && whereClause.lhs === $scope.options.selectedLinkField.columnName && whereClause.lhs && whereClause.rhs) {
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
                        calculateHeight: calculateGraphHeight,
                        calculateWidth: calculateGraphWidth,
                        getNodeSize: calculateNodeSize,
                        getNodeColor: calculateNodeColor,
                        getNodeText: createNodeText,
                        getNodeTooltip: createNodeTooltip,
                        getLinkSize: calculateLinkSize,
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

                $scope.queryForData();
            };

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
            $scope.createFilterClauseForNode = function(databaseAndTableName, fieldNames) {
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
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForNode, "Graph", $scope.queryForData);
                    }
                }
            };

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

            $scope.queryForData = function(reloadNetworkGraph, reloadNodeList) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                $scope.nodes = [];

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.selectedNodeField.columnName || !$scope.filteredNodes.length) {
                    $scope.numberOfNodesInGraph = 0;
                    // Don't call updateGraph() here.  It will cause an error because we're in a $scope.$apply.
                    $scope.graph.updateGraph({
                        nodes: [],
                        links: []
                    });
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
                    updateGraph([], []);
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

                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .withFields(fields);

                return query;
            };

            /**
             * Creates and shows this visualization's graph using the given data from a query.
             * @param {Array} data
             * @method createAndShowGraph
             * @private
             */
            var createAndShowGraph = function(data) {
                if(data.length >= $scope.options.nodeLimit) {
                    data = data.slice(0, $scope.options.nodeLimit);
                }

                // Maps source node IDs to an array of target node IDs to ensure each link we add to the graph is unique and help with clustering.
                var sourcesToTargets = {};
                // Maps target node IDs to an array of source node IDs to ensure each link we add to the graph is unique and help with clustering.
                var targetsToSources = {};
                // The nodes to be added to the graph.
                var nodes = [];
                // The links to be added to the graph.
                var links = [];

                var addNodeIfUnique = function(value) {
                    var node = _.find(nodes, function(node) {
                        return node.id === value;
                    });

                    if(!node) {
                        node = {
                            id: value,
                            name: value,
                            size: 0,
                            type: NODE_TYPE,
                            group: $scope.filteredNodes.indexOf(value) >= 0 ? QUERIED_NODE_GROUP : UNKNOWN_NODE_GROUP
                        };
                        nodes.push(node);
                    }

                    return node;
                };

                var addLinkIfUnique = function(sourceValue, targetValue) {
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
                            targetType: NODE_TYPE
                        });
                    }
                };

                // Add each unique value from the data to the graph as a node.
                data.forEach(function(datum) {
                    var nodeValue = datum[$scope.options.selectedNodeField.columnName];
                    if(nodeValue) {
                        var node = addNodeIfUnique(nodeValue);
                        // Add to size for each instance of the node in the data.
                        node.size++;
                        // Nodes that exist in the data are put in the default group.  Nodes that exist only as linked nodes are put in the unknown group.
                        node.group = (node.group === UNKNOWN_NODE_GROUP ? DEFAULT_NODE_GROUP : node.group);

                        if($scope.options.selectedLinkField && $scope.options.selectedLinkField.columnName && datum[$scope.options.selectedLinkField.columnName]) {
                            var linkedNodeValues = datum[$scope.options.selectedLinkField.columnName] || [];
                            linkedNodeValues = (linkedNodeValues.constructor === Array) ? linkedNodeValues : [linkedNodeValues];

                            // Add each related node to the graph as a node with a link to the original node.
                            linkedNodeValues.forEach(function(linkedNodeValue) {
                                if(linkedNodeValue && linkedNodeValue !== nodeValue) {
                                    // Nodes for linked nodes start at size 0.  Any instance of the linked node in the data will add to its size.
                                    // If the linked node is not in the data, the size will be an indicator to the user.
                                    addNodeIfUnique(linkedNodeValue);
                                    addLinkIfUnique(linkedNodeValue, nodeValue);
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

                var indexLinks = createIndexLinks(nodes, links);

                updateGraph(nodes, indexLinks);
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
                var nodesWithClusters = [];
                var linksWithClusters = links;

                var nextFreeClusterId = 1;
                var sourcesToClusterTargets = {};
                var targetsToClusterSources = {};

                // The cluster for all nodes that are not linked to any other nodes.
                var unlinkedCluster = {
                    type: CLUSTER_TYPE,
                    group: CLUSTER_NODE_GROUP,
                    nodes: []
                };

                var shouldCluster = function(id, map, reverseMap) {
                    if(map[id] && map[id].length > 1) {
                        // Ensure the cluster would contain more than one node.
                        return map[id].filter(function(otherId) {
                            return reverseMap[otherId].length === 1;
                        }).length > 1;
                    }
                    return false;
                };

                var addCluster = function(clusterId, sourceId, targetId, nodeToCluster) {
                    if(!clusterId) {
                        clusterId = nextFreeClusterId++;
                        linksWithClusters.push({
                            sourceId: sourceId || clusterId,
                            targetId: targetId || clusterId,
                            sourceType: sourceId ? NODE_TYPE : CLUSTER_TYPE,
                            targetType: targetId ? NODE_TYPE : CLUSTER_TYPE
                        });
                        nodesWithClusters.push({
                            id: clusterId,
                            type: CLUSTER_TYPE,
                            group: CLUSTER_NODE_GROUP,
                            nodes: [nodeToCluster]
                        });
                    } else {
                        linksWithClusters.push({
                            sourceId: sourceId || clusterId,
                            targetId: targetId || clusterId,
                            sourceType: sourceId ? NODE_TYPE : CLUSTER_TYPE,
                            targetType: targetId ? NODE_TYPE : CLUSTER_TYPE
                        });
                        var cluster = _.find(nodesWithClusters, function(node) {
                            return node.type === CLUSTER_TYPE && node.id === clusterId;
                        });
                        cluster.nodes.push(nodeToCluster);
                    }
                    return clusterId;
                };

                nodes.forEach(function(node, index) {
                    var numberOfTargets = sourcesToTargets[node.id] ? sourcesToTargets[node.id].length : 0;
                    var numberOfSources = targetsToSources[node.id] ? targetsToSources[node.id].length : 0;

                    // If the node has more than one link, keep it; otherwise, add it to a cluster.
                    if($scope.filteredNodes.indexOf(node.id) >= 0 || numberOfTargets > 1 || numberOfSources > 1 || (numberOfTargets === 1 && numberOfSources === 1)) {
                        nodesWithClusters.push(node);
                    } else if(numberOfTargets === 1) {
                        var targetId = sourcesToTargets[node.id][0];
                        if(shouldCluster(targetId, targetsToSources, sourcesToTargets)) {
                            targetsToClusterSources[targetId] = addCluster(targetsToClusterSources[targetId], null, targetId, node);
                        } else {
                            nodesWithClusters.push(node);
                        }
                    } else if(numberOfSources === 1) {
                        var sourceId = targetsToSources[node.id][0];
                        if(shouldCluster(sourceId, sourcesToTargets, targetsToSources)) {
                            sourcesToClusterTargets[sourceId] = addCluster(sourcesToClusterTargets[sourceId], sourceId, null, node);
                        } else {
                            nodesWithClusters.push(node);
                        }
                    } else {
                        unlinkedCluster.nodes.push(node);
                    }
                });

                if(unlinkedCluster.nodes.length) {
                    nodesWithClusters.push(unlinkedCluster);
                }

                return {
                    nodes: nodesWithClusters,
                    links: linksWithClusters
                };
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
                            size: 2
                        });
                    }
                });

                return indexLinks;
            };

            /**
             * Updates this visualization's graph with the given nodes and links.
             * @param {Array} nodes
             * @param {Array} links
             * @method updateGraph
             * @private
             */
            var updateGraph = function(nodes, links) {
                $scope.$apply(function() {
                    $scope.numberOfNodesInGraph = nodes.length;
                });

                $scope.graph.updateGraph({
                    nodes: nodes,
                    links: links
                });
            };

            /**
             * Returns the size for the given node.
             * @param {Object} node
             * @method calculateNodeSize
             * @private
             */
            var calculateNodeSize = function(node) {
                if(node.type === CLUSTER_TYPE) {
                    var size = 0;
                    node.nodes.forEach(function(nodeInCluster) {
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
                    return node.nodes.length;
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
                    var text = "<div>Cluster of " + node.nodes.length + ":</div><ul>";
                    node.nodes.forEach(function(nodeInCluster) {
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
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
