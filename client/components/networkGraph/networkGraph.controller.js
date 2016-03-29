'use strict';

/*
 * Copyright 2016 Next Century Corporation
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

/**
 * This visualization shows connected data in a directed network graph.
 * @namespace neonDemo.controllers
 * @class networkGraphController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('networkGraphController', ['$scope', '$timeout', '$filter', function($scope, $timeout, $filter) {
    var TIMEOUT_MS = 250;

    $scope.isDataLimited = false;
    $scope.bucketizer = dateBucketizer();
    $scope.mediator = undefined;

    $scope.tooltip = {
        idLabel: "",
        dataLabel: "",
        nameLabel: "",
        sizeLabel: "",
        flagLabel: "",
        sourceNameLabel: "",
        targetNameLabel: "",
        sourceSizeLabel: "",
        targetSizeLabel: ""
    };

    $scope.active.nodeField = {};
    $scope.active.nameField = {};
    $scope.active.sizeField = {};
    $scope.active.flagField = {};
    $scope.active.dateField = {};
    $scope.active.textField = {};
    $scope.active.linkedNodeField = {};
    $scope.active.linkedNameField = {};
    $scope.active.linkedSizeField = {};
    $scope.active.limit = 500000;
    $scope.active.flagMode = "";

    $scope.active.clusterNodes = true;
    $scope.active.existingNodeIds = [];
    $scope.active.hideSimpleNetworks = true;
    $scope.active.legend = [];
    $scope.active.selectedNodeId = "";
    $scope.active.selectedNodeIds = [];

    $scope.functions.createMenuText = function() {
        if(!$scope.mediator || !$scope.mediator.nodesTotal) {
            return "No Nodes";
        }
        var text = $scope.mediator.nodesTotal + " Nodes" + ($scope.mediator.nodesShown ? "" : " Hidden") + ($scope.isDataLimited ? " [Limited]" : "");
        if($scope.bucketizer && $scope.mediator && $scope.mediator.getSelectedDateBucket()) {
            text += " (" + $filter("date")($scope.bucketizer.getDateForBucket($scope.mediator.getSelectedDateBucket()).toISOString(), $scope.bucketizer.getDateFormat()) + ")";
        }
        return text;
    };

    $scope.functions.showMenuText = function() {
        return true;
    };

    $scope.functions.onInit = function() {
        $scope.functions.subscribe("date_bucketizer", function(message) {
            $scope.bucketizer = message.bucketizer;
            if($scope.mediator) {
                $scope.mediator.setBucketizer(message.bucketizer);
            }
        });
        $scope.functions.subscribe("date_selected", function(message) {
            if($scope.mediator) {
                $scope.mediator.selectDate(message.start);
            }
        });
        $scope.functions.addResizeListener(".legend");
    };

    $scope.functions.updateFilterValues = function(neonFilter) {
        // Select the networks for the nodes with IDs in the where clause(s) in the given Neon filter.
        var selectNodeNetworkFromWhereClause = function(whereClause) {
            if(whereClause.whereClauses) {
                for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                    selectNodeNetworkFromWhereClause(whereClause.whereClauses[i]);
                }
            } else if(whereClause.lhs && whereClause.rhs) {
                // See if the filter is either on the node field (e.g. user) or on the linked-node field (e.g. friend).
                if(whereClause.lhs === $scope.active.nodeField.columnName) {
                    $scope.selectNodeAndNetworkFromNodeId(whereClause.rhs);
                } else if($scope.functions.isFieldValid($scope.active.linkedNodeField) && whereClause.lhs === $scope.active.linkedNodeField.columnName) {
                    $scope.selectNodeAndNetworkFromNodeId(whereClause.rhs);
                }
            }
        };

        selectNodeNetworkFromWhereClause(neonFilter.filter.whereClause);
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.nodeField = $scope.functions.findFieldObject("nodeField", neonMappings.GRAPH_NODE);
        $scope.active.nameField = $scope.functions.findFieldObject("nameField", neonMappings.GRAPH_NODE_NAME);
        $scope.active.sizeField = $scope.functions.findFieldObject("sizeField", neonMappings.GRAPH_NODE_SIZE);
        $scope.active.dateField = $scope.functions.findFieldObject("dateField", neonMappings.DATE);
        $scope.active.flagField = $scope.functions.findFieldObject("flagField", neonMappings.GRAPH_FLAG);
        $scope.active.textField = $scope.functions.findFieldObject("textField", neonMappings.NEWSFEED_TEXT);
        $scope.active.linkedNodeField = $scope.functions.findFieldObject("linkedNodeField", neonMappings.GRAPH_LINKED_NODE);
        $scope.active.linkedNameField = $scope.functions.findFieldObject("linkedNameField", neonMappings.GRAPH_LINKED_NODE_NAME);
        $scope.active.linkedSizeField = $scope.functions.findFieldObject("linkedSizeField", neonMappings.GRAPH_LINKED_NODE_SIZE);

        $scope.active.selectedNodeIds = [];

        $scope.active.flagMode = $scope.bindings.flagMode || $scope.functions.getMapping(neonMappings.GRAPH_FLAG_MODE) || "";

        $scope.tooltip = {
            idLabel: $scope.bindings.tooltipIdLabel || $scope.functions.getMapping(neonMappings.GRAPH_TOOLTIP_ID_LABEL) || "",
            dataLabel: $scope.bindings.tooltipDateLabel || $scope.functions.getMapping(neonMappings.GRAPH_TOOLTIP_DATA_LABEL) || "",
            nameLabel: $scope.bindings.tooltipNameLabel || $scope.functions.getMapping(neonMappings.GRAPH_TOOLTIP_NAME_LABEL) || "",
            sizeLabel: $scope.bindings.tooltipSizeLabel || $scope.functions.getMapping(neonMappings.GRAPH_TOOLTIP_SIZE_LABEL) || "",
            flagLabel: $scope.bindings.tooltipFlagLabel || $scope.functions.getMapping(neonMappings.GRAPH_TOOLTIP_FLAG_LABEL) || "",
            sourceNameLabel: $scope.bindings.tooltipSourceNameLabel || $scope.functions.getMapping(neonMappings.GRAPH_TOOLTIP_SOURCE_NAME_LABEL) || "",
            targetNameLabel: $scope.bindings.tooltipTargetNameLabel || $scope.functions.getMapping(neonMappings.GRAPH_TOOLTIP_TARGET_NAME_LABEL) || "",
            sourceSizeLabel: $scope.bindings.tooltipSourceSizeLabel || $scope.functions.getMapping(neonMappings.GRAPH_TOOLTIP_SOURCE_SIZE_LABEL) || "",
            targetSizeLabel: $scope.bindings.tooltipTargetSizeLabel || $scope.functions.getMapping(neonMappings.GRAPH_TOOLTIP_TARGET_SIZE_LABEL) || ""
        };
    };

    /**
     * Recreates the graph with blank graph data.  Keeps the currently selected node IDs.
     * @method recreateGraph
     * @private
     */
    var recreateGraph = function() {
        var updateSelectedNodeIdsInAngularDigest = function() {
            $scope.$apply(function() {
                updateSelectedNodeIds();
            });
        };

        var redrawGraphInAngularDigest = function() {
            $scope.$apply(function() {
                if($scope.mediator) {
                    $scope.mediator.redrawGraph();
                }
            });
        };

        $scope.mediator = new mediators.DirectedGraphMediator($scope.functions.getElement()[0], ".directed-graph", {
            calculateGraphHeight: function() {
                return $scope.functions.getElement(".directed-graph").height();
            },
            calculateGraphWidth: function() {
                return $scope.functions.getElement(".directed-graph").width();
            },
            redrawGraph: redrawGraphInAngularDigest,
            updateSelectedNodeIds: updateSelectedNodeIdsInAngularDigest
        });

        $scope.mediator.setBucketizer($scope.bucketizer);
        $scope.mediator.setSelectedNodeIds($scope.active.selectedNodeIds);
        $scope.mediator.setTooltip($scope.tooltip);
    };

    /**
     * Updates the selected node IDs from the selected node IDs saved in the mediator and publishes a news highlights event.
     * @method updateSelectedNodeIDs
     * @private
     */
    var updateSelectedNodeIds = function() {
        $scope.active.selectedNodeIds = angular.copy($scope.mediator.getSelectedNodeIds());
        publishNewsHighlights();
    };

    /**
     * Publishes a news event using the given graph data.
     * @param {Array} data
     * @method publishNews
     * @private
     */
    var publishNews = function(data) {
        var news = [];
        data.forEach(function(item) {
            var newsItem = {
                primaryTitle: neon.helpers.getNestedValues(item, $scope.active.nodeField.columnName)
            };
            if($scope.functions.isFieldValid($scope.active.dateField)) {
                newsItem.date = new Date(neon.helpers.getNestedValues(item, $scope.active.dateField.columnName).sort(function(a, b) {
                    return new Date(a).getTime() - new Date(b).getTime();
                })[0]);
            }
            if($scope.functions.isFieldValid($scope.active.nameField)) {
                newsItem.secondaryTitle = neon.helpers.getNestedValues(item, $scope.active.nameField.columnName);
            }
            if($scope.functions.isFieldValid($scope.active.textField)) {
                newsItem.content = neon.helpers.getNestedValues(item, $scope.active.textField.columnName);
                // Delete the text from the data to improve our memory preformance because we don't need it any longer.
                delete item[$scope.active.textField.columnName];
            }
            news.push(newsItem);
        });

        $scope.functions.publish("news", {
            news: news,
            name: $scope.bindFeedName || $scope.functions.getMapping(neonMappings.NEWSFEED_NAME) || "graph",
            type: $scope.bindFeedType || $scope.functions.getMapping(neonMappings.NEWSFEED_TYPE) || ""
        });
    };

    /**
     * Publishes a news highlights event using the global selected nodes and network.
     * @method publishNewsHighlights
     * @private
     */
    var publishNewsHighlights = function() {
        $scope.functions.publish("news_highlights", {
            name: $scope.bindFeedName || $scope.functions.getMapping(neonMappings.NEWSFEED_NAME) || "graph",
            show: {
                primaryTitles: $scope.mediator ? $scope.mediator.getNodeIdsInSelectedNetwork() : []
            },
            highlights: {
                primaryTitles: $scope.active.selectedNodeIds
            }
        });
    };

    $scope.functions.areDataFieldsValid = function() {
        // This is checked before a query is run, so only return true if runQuery is enabled or node(s) are selected.
        // Since network graph queries can take a long time, we don't want to run them all the time (only on demand).
        return $scope.functions.isFieldValid($scope.active.nodeField) && ($scope.runQuery || $scope.active.selectedNodeIds.length);
    };

    /**
     * Query for the list of nodes that link to the filtered nodes and draw the graph containing the network.
     * @method queryForNetworkGraph
     */
    $scope.queryForNetworkGraph = function() {
        // Enable runQuery to signal that the next query triggered should be run (not ignored).
        $scope.runQuery = true;
        // TODO Log user button click
        $scope.functions.queryAndUpdate();
    };

    /**
     * Query for the list of nodes using the selected field but do not draw a graph.
     * @param {Object} connection
     * @method queryForNodeList
     * @private
     */
    $scope.queryForNodeList = function() {
        // Enable runQuery to signal that the next query triggered should be run (not ignored).
        $scope.runQuery = true;
        // TODO Log user button click
        $scope.functions.queryAndUpdate({
            addToQuery: function(query) {
                query.withFields([$scope.active.nodeField.columnName]).groupBy($scope.active.nodeField).aggregate(neon.query.COUNT, '*', 'count');
                return query;
            },
            updateData: updateNodeListData
        });
    };

    var updateNodeListData = function(data) {
        if(data) {
            // Reset runQuery on a response containing data (as opposed to a reset in which the data is null).
            $scope.runQuery = false;
        }

        (data || []).forEach(function(item) {
            var nodeId = item[$scope.active.nodeField.columnName];
            if($scope.active.existingNodeIds.indexOf(nodeId) < 0) {
                $scope.active.existingNodeIds.push(nodeId);
            }
        });

        // Sort the nodes so they are displayed in alphabetical order in the options dropdown.
        $scope.active.existingNodeIds.sort(function(a, b) {
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
    };

    /**
     * Returns an object containing all of the graph options for the graph mediator.
     * @method gatherMediatorOptions
     * @private
     * @return {Object}
     */
    var gatherMediatorOptions = function() {
        return {
            hideSimpleNetworks: $scope.active.hideSimpleNetworks,
            useNodeClusters: $scope.active.clusterNodes,
            nodeField: $scope.functions.isFieldValid($scope.active.nodeField) ? $scope.active.nodeField.columnName : "",
            nameField: $scope.functions.isFieldValid($scope.active.nameField) ? $scope.active.nameField.columnName : "",
            sizeField: $scope.functions.isFieldValid($scope.active.sizeField) ? $scope.active.sizeField.columnName : "",
            linkedNodeField: $scope.functions.isFieldValid($scope.active.linkedNodeField) ? $scope.active.linkedNodeField.columnName : "",
            linkedNameField: $scope.functions.isFieldValid($scope.active.linkedNameField) ? $scope.active.linkedNameField.columnName : "",
            linkedSizeField: $scope.functions.isFieldValid($scope.active.linkedSizeField) ? $scope.active.linkedSizeField.columnName : "",
            dateField: $scope.functions.isFieldValid($scope.active.dateField) ? $scope.active.dateField.columnName : "",
            flagField: $scope.functions.isFieldValid($scope.active.flagField) ? $scope.active.flagField.columnName : "",
            flagMode: $scope.active.flagMode || ""
        };
    };

    $scope.functions.addToQuery = function(query) {
        var fields = [$scope.active.nodeField.columnName];
        if($scope.functions.isFieldValid($scope.active.nameField)) {
            fields.push($scope.active.nameField.columnName);
        }
        if($scope.functions.isFieldValid($scope.active.sizeField)) {
            fields.push($scope.active.sizeField.columnName);
        }
        if($scope.functions.isFieldValid($scope.active.linkedNodeField)) {
            fields.push($scope.active.linkedNodeField.columnName);
        }
        if($scope.functions.isFieldValid($scope.active.linkedNameField)) {
            fields.push($scope.active.linkedNameField.columnName);
        }
        if($scope.functions.isFieldValid($scope.active.linkedSizeField)) {
            fields.push($scope.active.linkedSizeField.columnName);
        }
        if($scope.functions.isFieldValid($scope.active.flagField)) {
            fields.push($scope.active.flagField.columnName);
        }
        if($scope.functions.isFieldValid($scope.active.textField)) {
            fields.push($scope.active.textField.columnName);
        }

        query.withFields(fields).limit($scope.active.limit);

        if($scope.functions.isFieldValid($scope.active.dateField)) {
            query.sortBy($scope.active.dateField.columnName, neon.query.ASCENDING);
        }

        if($scope.active.selectedNodeIds.length) {
            var whereClauses = $scope.active.selectedNodeIds.map(function(nodeId) {
                var whereClause = neon.query.where($scope.active.nodeField.columnName, "=", nodeId);
                if($scope.functions.isFieldValid($scope.active.linkedNodeField)) {
                    return neon.query.or(whereClause, neon.query.where($scope.active.linkedNodeField.columnName, "=", nodeId));
                }
                return whereClause;
            });
            query.filter.whereClause = whereClauses.length > 1 ? neon.query.or.apply(neon.query, whereClauses) : whereClauses[0];
        }

        return query;
    };

    $scope.functions.updateData = function(data) {
        if(data) {
            // Reset runQuery on a response containing data (as opposed to a reset in which the data is null).
            $scope.runQuery = false;
        }

        var graphData = data || [];
        $scope.isDataLimited = graphData.length ? (graphData.length >= $scope.active.limit) : false;
        $scope.active.legend = graphData.length ? $scope.mediator.createLegend($scope.active.clusterNodes, $scope.functions.isFieldValid($scope.active.flagField), $scope.tooltip.flagLabel) : [];

        recreateGraph();
        publishNews(graphData);
        publishNewsHighlights();

        if(graphData.length && $scope.mediator) {
            $scope.mediator.evaluateDataAndUpdateGraph(graphData, gatherMediatorOptions());
        }
    };

    /**
     * Deselected all selected nodes and the selected node network in the graph.
     * @method deselectAllNodesAndNetwork
     */
    $scope.deselectAllNodesAndNetwork = function() {
        // TODO Log user deselect
        if($scope.mediator) {
            $scope.mediator.deselectAllNodesAndNetwork();
            updateSelectedNodeIds();
        }
    };

    /**
     * Selects the node in the graph with the global selected node ID and its network.
     * @method selectNodeAndNetworkFromNodeId
     */
    $scope.selectNodeAndNetworkFromNodeId = function() {
        // TODO Log user select
        if($scope.mediator) {
            $scope.mediator.selectNodeAndNetworkFromNodeId($scope.active.selectedNodeId);
            updateSelectedNodeIds();
        }
    };

    $scope.getNotificationData = function() {
        var size = $scope.active.selectedNodeIds.length;
        return size ? [size + (size === 1 ? " Node" : " Nodes")] : [];
    };

    $scope.createNotificationDescOrText = function(value) {
        return "Selected " + value;
    };

    $scope.createNotificationRemoveDesc = function(value) {
        return "Deselect " + value;
    };

    $scope.handleChangeNodeField = function() {
        $scope.functions.logChangeAndUpdate("nodeField", $scope.active.nodeField.columnName);
    };

    $scope.handleChangeNameField = function() {
        $scope.functions.logChangeAndUpdate("nameField", $scope.active.nameField.columnName);
    };

    $scope.handleChangeSizeField = function() {
        $scope.functions.logChangeAndUpdate("sizeField", $scope.active.sizeField.columnName);
    };

    $scope.handleChangeLinkedNodeField = function() {
        $scope.functions.logChangeAndUpdate("linkedNodeField", $scope.active.linkedNodeField.columnName);
    };

    $scope.handleChangeLinkedNameField = function() {
        $scope.functions.logChangeAndUpdate("linkedNameField", $scope.active.linkedNameField.columnName);
    };

    $scope.handleChangeLinkedSizeField = function() {
        $scope.functions.logChangeAndUpdate("linkedSizeField", $scope.active.linkedSizeField.columnName);
    };

    $scope.handleChangeDateField = function() {
        $scope.functions.logChangeAndUpdate("dateField", $scope.active.dateField.columnName);
    };

    $scope.handleChangeFlagField = function() {
        $scope.functions.logChangeAndUpdate("flagField", $scope.active.flagField.columnName);
    };

    $scope.handleChangeTextField = function() {
        $scope.functions.logChangeAndUpdate("textField", $scope.active.textField.columnName);
    };

    $scope.handleChangeLimit = function() {
        $scope.functions.logChangeAndUpdate("limit", $scope.active.limit, "button");
    };

    $scope.handleToggleHideSimpleNetworks = function() {
        $scope.runQuery = true;
        $scope.functions.logChangeAndUpdate("hideSimpleNetworks", $scope.active.hideSimpleNetworks, "button");
    };

    $scope.handleToggleClusterNodes = function() {
        $scope.runQuery = true;
        $scope.functions.logChangeAndUpdate("clusterNodes", $scope.active.clusterNodes, "button");
    };

    $scope.functions.hideHeaders = function() {
        return false;
    };

    $scope.functions.createExportDataObject = function(exportId, query) {
        // TODO Update due to recent graph changes.
        var fields = [];
        if($scope.functions.isFieldValid($scope.active.nodeField) && $scope.functions.isFieldValid($scope.active.linkedNodeField)) {
            fields = [{
                query: $scope.active.nodeField.columnName,
                pretty: $scope.active.nodeField.prettyName
            },{
                query: $scope.active.linkedNodeField.columnName,
                pretty: $scope.active.linkedNodeField.prettyName
            }];
            query.groupBy($scope.active.nodeField, $scope.active.linkedNodeField);
        } else if($scope.functions.isFieldValid($scope.active.nodeField)) {
            fields = [{
                query: $scope.active.nodeField.columnName,
                pretty: $scope.active.nodeField.prettyName
            }];
            query.groupBy($scope.active.nodeField);
        } else if($scope.functions.isFieldValid($scope.active.linkedNodeField)) {
            fields = [{
                query: $scope.active.linkedNodeField.columnName,
                pretty: $scope.active.linkedNodeField.prettyName
            }];
            query.groupBy($scope.active.linkedNodeField);
        }

        var finalObject = {
            name: "Network Graph",
            data: [{
                query: query,
                name: "networkGraph-" + exportId,
                fields: fields,
                ignoreFilters: query.ignoreFilters_,
                selectionOnly: query.selectionOnly_,
                ignoredFilterIds: query.ignoredFilterIds_,
                type: "query"
            }]
        };
        return finalObject;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.feedName = $scope.bindFeedName ? $scope.bindFeedName : undefined;
        bindings.feedType = $scope.bindFeedType ? $scope.bindFeedType : undefined;
        bindings.nodeField = $scope.functions.isFieldValid($scope.active.nodeField) ? $scope.active.nodeField : undefined;
        bindings.nameField = $scope.functions.isFieldValid($scope.active.nameField) ? $scope.active.nameField : undefined;
        bindings.sizeField = $scope.functions.isFieldValid($scope.active.sizeField) ? $scope.active.sizeField : undefined;
        bindings.dateField = $scope.functions.isFieldValid($scope.active.dateField) ? $scope.active.dateField : undefined;
        bindings.flagField = $scope.functions.isFieldValid($scope.active.flagField) ? $scope.active.flagField : undefined;
        bindings.textField = $scope.functions.isFieldValid($scope.active.textField) ? $scope.active.textField : undefined;
        bindings.linkedNodeField = $scope.functions.isFieldValid($scope.active.linkedNodeField) ? $scope.active.linkedNodeField : undefined;
        bindings.linkedNameField = $scope.functions.isFieldValid($scope.active.linkedNameField) ? $scope.active.linkedNameField : undefined;
        bindings.linkedSizeField = $scope.functions.isFieldValid($scope.active.linkedSizeField) ? $scope.active.linkedSizeField : undefined;
        bindings.flagMode = $scope.active.flagMode || undefined;
        bindings.tooltipIdLabel = $scope.tooltip.idLabel || undefined;
        bindings.tooltipDataLabel = $scope.tooltip.dataLabel || undefined;
        bindings.tooltipNameLabel = $scope.tooltip.nameLabel || undefined;
        bindings.tooltipSizeLabel = $scope.tooltip.sizeLabel || undefined;
        bindings.tooltipFlagLabel = $scope.tooltip.flagLabel || undefined;
        bindings.tooltipSourceNameLabel = $scope.tooltip.sourceNameLabel || undefined;
        bindings.tooltipTargetNameLabel = $scope.tooltip.targetNameLabel || undefined;
        bindings.tooltipSourceSizeLabel = $scope.tooltip.sourceSizeLabel || undefined;
        bindings.tooltipTargetSizeLabel = $scope.tooltip.targetSizeLabel || undefined;
        return bindings;
    };
}]);
