'use strict';
/*
 * Copyright 2015 Next Century Corporation
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

var mediators = mediators || {};

/**
 * Creates, maintains, and updates a directed graph.  Takes query result data, creates the nodes and links for the graph, and handles graph styling callbacks.
 * @param {Object} root The root element for the directed graph.
 * @param {String} selector The class selected for the directed graph.
 * @param {Object} callbacks Containing {Function} calculateGraphHeight, {Function} calculateGraphWidth, {Function} redrawGraph, and {Function} updateSelectedNodeIds.
 */
mediators.DirectedGraphMediator = function(root, selector, callbacks) {
    this.callbacks = callbacks;

    this.bucketizer = dateBucketizer();
    this.options = {};
    this.tooltip = {};

    this.graphNodes = [];
    this.graphLinks = [];

    this.maps = {
        nodeIdsToFlags: {},
        nodeIdsToClusterIds: {},
        nodeIdsToNetworkIds: {},
        networkIdsToNodeIds: {},
        dateBucketsToNodeIndices: {},
        dateBucketsToLinkIndices: {}
    };

    this.selected = {
        dateBucket: undefined,
        graphNodeIds: [],
        graphNetworkId: undefined,
        mouseoverNodeIds: [],
        mouseoverNetworkId: undefined
    };

    this.graph = new charts.DirectedGraph(root, selector, {
        getHeight: callbacks.calculateGraphHeight,
        getWidth: callbacks.calculateGraphWidth,
        getNodeKey: getNodeKey,
        getLinkKey: getLinkKey,
        getNodeSize: createFunctionToCalculateNodeSize(this),
        getNodeColor: createFunctionToCalculateNodeColor(this),
        getNodeOpacity: createFunctionToCalculateNodeOpacity(this),
        getNodeText: createFunctionToGenerateNodeText(this),
        getNodeTooltip: createFunctionToGenerateNodeTooltip(this),
        getLinkSize: createFunctionToCalculateLinkSize(this),
        getLinkColor: createFunctionToCalculateLinkColor(this),
        getLinkOpacity: createFunctionToCalculateLinkOpacity(this),
        getLinkArrowhead: createFunctionToFindLinkArrowhead(this),
        getLinkTooltip: createFunctionToGenerateLinkTooltip(this),
        nodeMousemoveHandler: createFunctionToHandleNodeSelect(this),
        nodeMouseoutHandler: createFunctionToHandleNodeDeselect(this),
        nodeClickHandler: createFunctionToHandleNodeClick(this),
        linkMousemoveHandler: createFunctionToHandleLinkSelect(this),
        linkMouseoutHandler: createFunctionToHandleLinkDeselect(this),
        linkClickHandler: createFunctionToHandleLinkClick(this)
    });

    this.graph.createArrowhead(mediators.DirectedGraphMediator.FOCUSED_COLOR_ARROWHEAD, mediators.DirectedGraphMediator.FOCUSED_COLOR, this.graph.DEFAULT_LINK_STROKE_OPACITY);
};

/**
 * Creates and shows the graph using the given query result data and graph options.
 * @param {Array} data The list of data.
 * @param {Object} options The options which must contain at least {String} nodeField.
 * @method evaluateDataAndUpdateGraph
 */
mediators.DirectedGraphMediator.prototype.evaluateDataAndUpdateGraph = function(data, options) {
    this.options = options;
    this.options.flagMode = this.options.flagMode || mediators.DirectedGraphMediator.FLAG_LINKED;

    if(!options.nodeField) {
        return;
    }

    // The nodes to be added to the graph.
    var nodes = [];
    // The links to be added to the graph.
    var links = [];
    // Maps source node IDs to an array of target node IDs.  Needed for clustering and to ensure each link we add to the graph is unique.
    this.maps.sourcesToTargets = {};
    // Maps target node IDs to an array of source node IDs.  Needed for clustering and to ensure each link we add to the graph is unique.
    this.maps.targetsToSources = {};
    // Maps source node IDs to target node IDs to an array of dates for each instance of a link between the source and target nodes.  Needed to give the correct dates to the finalized links.
    this.maps.sourcesToTargetsToLinkDates = {};
    // Maps node IDs to the cluster node IDs that contain them.  Needed to create the finalized links.
    this.maps.nodeIdsToClusterIds = {};
    // Maps node IDs to their boolean flags.  Needed to avoid clustering/hiding flagged nodes and to calculate node styling.
    this.maps.nodeIdsToFlags = {};
    // Maps node IDs to their network IDs.  Needed for node selection and to calculate node styling.
    this.maps.nodeIdsToNetworkIds = {};
    // Maps network IDs to the IDs of nodes in that network.  Needed for public access and to calculate node styling.
    this.maps.networkIdsToNodeIds = {};

    var mediator = this;

    // Add each unique node from the data to the graph as a node.
    data.forEach(function(item) {
        var nodeId = item[options.nodeField];
        var nodeName = options.nameField ? item[options.nameField] : nodeId;
        var nodeSize = options.sizeField ? item[options.sizeField] : 1;
        var nodeFlag = options.flagField ? item[options.flagField] : true;
        var itemDate = options.dateField ? new Date(item[options.dateField]) : undefined;

        if(nodeId) {
            var node = addNodeIfUnique(nodes, nodeId, nodeName, nodeSize);
            node.dates.push(itemDate);
            // Add a flag using a boolean field in the data if configured to do so.  The flag defaults to false.
            node.flag = (options.flagMode === mediators.DirectedGraphMediator.FLAG_RESULT || options.flagMode === mediators.DirectedGraphMediator.FLAG_ALL) ? nodeFlag : false;
            mediator.maps.nodeIdsToFlags[node.id] = node.flag;
            // Mark this node as a node created from a data item.
            node.inData = true;

            // Find the data for the linked nodes (if configured) from the data item.
            var linkedNodeIds = createFieldArray(options.linkedNodeField, item, 0);
            var linkedNodeNames = createFieldArray(options.linkedNameField, item, linkedNodeIds.length);
            var linkedNodeSizes = createFieldArray(options.linkedSizeField, item, linkedNodeIds.length);

            // Add each linked node to the graph as a node with a link to the original node.
            linkedNodeIds.forEach(function(linkedNodeId, index) {
                if(linkedNodeId && linkedNodeId !== nodeId) {
                    // Linked nodes have no date because each date is an instance of the node in the data.  Future instances of the linked node in the data will add their dates to
                    // the linked node's date array.  If the linked node is not in the data, it will be styled different based on the inData property.
                    var linkedNode = addNodeIfUnique(nodes, linkedNodeId, linkedNodeNames[index], linkedNodeSizes[index]);
                    // Add a flag using a boolean field in the data if configured to do so.  The flag defaults to false.
                    linkedNode.flag = (options.flagMode === mediators.DirectedGraphMediator.FLAG_LINKED || options.flagMode === mediators.DirectedGraphMediator.FLAG_ALL) ? nodeFlag : false;
                    mediator.maps.nodeIdsToFlags[linkedNode.id] = mediator.maps.nodeIdsToFlags[linkedNode.id] || linkedNode.flag;
                    addLinkIfUnique(links, linkedNodeId, nodeId, itemDate, mediator.maps);
                }
            });
        }
    });

    // Cluster and hide nodes if specified in the options.
    nodes = clusterNodesAndHideSimpleNetworks(nodes, this.maps, (this.selected.graphNodeIds.length > 0), options.hideSimpleNetworks, options.useNodeClusters);
    sortNodeOrLinkListByDate(nodes);

    // Set the node/link network IDs and transform links connecting node IDs to links connecting node indices.
    links = finalizeNetworksAndCreateLinks(nodes, links, this.maps, this.selected);
    sortNodeOrLinkListByDate(links);

    // Initialize the date buckets containing node/link indices for each date.
    initializeDateBuckets(nodes, links, this.bucketizer, this.maps);

    this.saveDataAndUpdateGraph(nodes, links);

    // Delete maps that are no longer needed.
    delete this.maps.sourcesToTargets;
    delete this.maps.targetsToSources;
    delete this.maps.sourcesToTargetsToLinkDates;
    delete this.maps.nodeIdsToClusterIds;
};

/**
 * Adds a node for the given ID, name, and size to the list of nodes if it does not already exist and returns the node.
 * @param {Array} nodes
 * @param {Number} or {String} id
 * @param {Number} or {String} name
 * @param {Number} size
 * @method addNodeIfUnique
 * @private
 * @return {Object}
 */
var addNodeIfUnique = function(nodes, id, name, size) {
    var node = _.find(nodes, function(node) {
        return node.id === id;
    });

    if(!node) {
        node = createNode(id, name, mediators.DirectedGraphMediator.NODE_TYPE, size);
        nodes.push(node);
    } else {
        // Use the most recent name.
        node.name = name || node.name;
        // Use the biggest size.
        node.size = Math.max(size, node.size);
    }

    return node;
};

/**
 * Creates and returns a new node for the graph.
 * @param {Number} or {String} id
 * @param {Number} or {String} name
 * @param {Number} or {String} type
 * @param {Number} size
 * @param {Array} dates (optional)
 * @method createNode
 * @private
 * @return {Object}
 */
var createNode = function(id, name, type, size, dates) {
    return {
        id: id,
        dates: dates ? dates : [],
        name: name || "",
        network: 0,
        size: size,
        type: type,
        key: createNodeKey(id, type)
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
 * Adds a link for the given source and target to the given list of links if it does not already exist.
 * @param {Array} links
 * @param {Number} or {String} sourceId
 * @param {Number} or {String} targetId
 * @param {Date} date
 * @param {Object} maps Contains {Object} sourcesToTargets, {Object} targetsToSources, and {Object} sourcesToTargetsToLinkDates
 * @method addLinkIfUnique
 * @private
 */
var addLinkIfUnique = function(links, sourceId, targetId, date, maps) {
    if(!maps.targetsToSources[targetId]) {
        maps.targetsToSources[targetId] = [];
    }

    if(maps.targetsToSources[targetId].indexOf(sourceId) < 0) {
        maps.targetsToSources[targetId].push(sourceId);
    }

    if(!maps.sourcesToTargets[sourceId]) {
        maps.sourcesToTargets[sourceId] = [];
    }

    if(maps.sourcesToTargets[sourceId].indexOf(targetId) < 0) {
        maps.sourcesToTargets[sourceId].push(targetId);
        links.push(createLink(sourceId, targetId));
        if(!maps.sourcesToTargetsToLinkDates[sourceId]) {
            maps.sourcesToTargetsToLinkDates[sourceId] = {};
        }
        if(!maps.sourcesToTargetsToLinkDates[sourceId][targetId]) {
            maps.sourcesToTargetsToLinkDates[sourceId][targetId] = [];
        }
    }

    maps.sourcesToTargetsToLinkDates[sourceId][targetId].push(date);
};

/**
 * Creates and returns a new link connecting two nodes with the given IDs.
 * @param {Number} or {String} sourceId
 * @param {Number} or {String} targetId
 * @method createLink
 * @private
 * @return {Object}
 */
var createLink = function(sourceId, targetId) {
    return {
        sourceId: sourceId,
        targetId: targetId
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
 * Creates and returns an array of the given length for the field in the given data item.
 * @param {String} columnName
 * @param {Object} item
 * @param {Number} length
 * @method createFieldArray
 * @private
 * @return {Array}
 */
var createFieldArray = function(columnName, item, length) {
    var array = [];
    if(columnName) {
        array = item[columnName] || [];
        array = (array.constructor === Array) ? array : [array];
    }
    if(array.length < length) {
        for(var i = array.length; i < length; ++i) {
            array.push(undefined);
        }
    }
    return array;
};

/**
 * Creates clusters for nodes in the given array and hides simple networks containing zero or one link if specified in the options.  Returns the new list of nodes.
 * @param {Array} nodes
 * @param {Object} maps Containing {Object} sourcesToTargets, {Object} targetsToSources, {Object} nodeIdsToFlags, {Object} nodeIdsToClusterIds, {Object} nodeIdsToNetworkIds, and
 * {Object} networkIdsToNodeIds.
 * @param {Boolean} hasSelected Whether the graph has selected nodes.
 * @param {Boolean} hideSimpleNetworks Whether to hide simple networks containing zero or one link.
 * @param {Boolean} useNodeClusters Whether to cluster nodes.
 * @method clusterNodesAndHideSimpleNetworks
 * @return {Array}
 */
var clusterNodesAndHideSimpleNetworks = function(nodes, maps, hasSelected, hideSimpleNetworks, useNodeClusters) {
    // Create cluster nodes, ignore nodes that are replaced by cluster nodes, and hide nodes within simple networks containing zero or one link, as appropriate.
    var resultNodes = [];

    // Give each cluster a unique ID.
    var nextFreeClusterId = 1;

    // The cluster for all nodes that are not linked to any other nodes.
    var unlinkedCluster = createNode(0, null, mediators.DirectedGraphMediator.CLUSTER_TYPE, 0);
    unlinkedCluster.nodes = [];
    maps.networkIdsToNodeIds[0] = [];

    // Maps the IDs of nodes with only one source or target to the IDs of the cluster nodes to which they are linked.  Needed to save used cluster IDs.
    var nodeIdsToLinkedClusterIds = {};

    nodes.forEach(function(node) {
        sortNodeDates(node);
        node.numberOfTargets = maps.sourcesToTargets[node.id] ? maps.sourcesToTargets[node.id].length : 0;
        node.numberOfSources = maps.targetsToSources[node.id] ? maps.targetsToSources[node.id].length : 0;

        if(maps.nodeIdsToFlags[node.id]) {
            resultNodes.push(node);
        } else if(node.numberOfTargets > 1 || node.numberOfSources > 1 || (node.numberOfTargets === 1 && node.numberOfSources === 1)) {
            var nodeIdsForCluster = useNodeClusters ? findNodeIdsForMultipleLinkCluster(node, maps.sourcesToTargets, maps.targetsToSources) : [];
            if(nodeIdsForCluster.length > 1) {
                var clusterId = addCluster(resultNodes, maps.nodeIdsToClusterIds[node.id] || nextFreeClusterId++, node, maps.nodeIdsToClusterIds);
                nodeIdsForCluster.forEach(function(nodeId) {
                    maps.nodeIdsToClusterIds[nodeId] = clusterId;
                });
            } else if(node.numberOfTargets >= 1 && node.numberOfSources >= 1) {
                resultNodes.push(node);
            } else if(node.numberOfTargets > 1 && shouldAddMultipleLinkNode(node.id, maps.sourcesToTargets, maps.targetsToSources, hasSelected, hideSimpleNetworks, maps.nodeIdsToFlags)) {
                resultNodes.push(node);
            } else if(node.numberOfSources > 1 && shouldAddMultipleLinkNode(node.id, maps.targetsToSources, maps.sourcesToTargets, hasSelected, hideSimpleNetworks, maps.nodeIdsToFlags)) {
                resultNodes.push(node);
            }
        } else if(node.numberOfTargets === 1) {
            var targetId = maps.sourcesToTargets[node.id][0];
            var numberOfNodesToCluster = findNumberOfNodesToCluster(targetId, maps.targetsToSources, maps.sourcesToTargets);
            if(useNodeClusters && numberOfNodesToCluster > 1) {
                if(shouldAddClusterNode(targetId, maps.targetsToSources, maps.sourcesToTargets, numberOfNodesToCluster, hasSelected, hideSimpleNetworks, maps.nodeIdsToFlags)) {
                    nodeIdsToLinkedClusterIds[targetId] = addCluster(resultNodes, nodeIdsToLinkedClusterIds[targetId] || nextFreeClusterId++, node, maps.nodeIdsToClusterIds);
                }
            } else if(shouldAddSingleLinkNode(targetId, maps.targetsToSources, hasSelected, hideSimpleNetworks, maps.nodeIdsToFlags)) {
                resultNodes.push(node);
            }
        } else if(node.numberOfSources === 1) {
            var sourceId = maps.targetsToSources[node.id][0];
            var numberOfNodesToCluster = findNumberOfNodesToCluster(sourceId, maps.sourcesToTargets, maps.targetsToSources);
            if(useNodeClusters && numberOfNodesToCluster > 1) {
                if(shouldAddClusterNode(sourceId, maps.sourcesToTargets, maps.targetsToSources, numberOfNodesToCluster, hasSelected, hideSimpleNetworks, maps.nodeIdsToFlags)) {
                    nodeIdsToLinkedClusterIds[sourceId] = addCluster(resultNodes, nodeIdsToLinkedClusterIds[sourceId] || nextFreeClusterId++, node, maps.nodeIdsToClusterIds);
                }
            } else if(shouldAddSingleLinkNode(sourceId, maps.sourcesToTargets, hasSelected, hideSimpleNetworks, maps.nodeIdsToFlags)) {
                resultNodes.push(node);
            }
        } else if(hasSelected || !hideSimpleNetworks) {
            if(useNodeClusters) {
                unlinkedCluster.nodes.push(node);
                unlinkedCluster.dates = unlinkedCluster.dates.concat(node.dates);
            } else {
                resultNodes.push(node);
            }
            maps.nodeIdsToNetworkIds[node.id] = 0;
            maps.networkIdsToNodeIds[0].push(node.id);
        }
    });

    if(unlinkedCluster.nodes.length) {
        sortNodeDates(unlinkedCluster);
        resultNodes.push(unlinkedCluster);
    }

    return resultNodes;
};

/**
 * Sorts the array of dates in the given object.
 * @param {Object} object
 * @method sortNodeDates
 * @private
 */
var sortNodeDates = function(object) {
    object.dates.sort(function(a, b) {
        return a.getTime() - b.getTime();
    });
};

/**
 * Returns the list of node IDs (including the ID of the given node) that should be contained within a multiple-link cluster,
 * or an empty list if no such cluster should be created.
 * @param {Object} node
 * @param {Object} sourcesToTargets The mapping from source node IDs to target node IDs.
 * @param {Object} targetsToSources The mapping from target node IDs to source node IDs.
 * @method findNodeIdsForMultipleLinkCluster
 * @return {Array}
 */
var findNodeIdsForMultipleLinkCluster = function(node, sourcesToTargets, targetsToSources) {
    var nodeLists = [];
    if(node.numberOfTargets >= 1) {
        nodeLists = nodeLists.concat(sourcesToTargets[node.id].map(function(targetId) {
            return targetsToSources[targetId];
        }));
    }
    if(node.numberOfSources >= 1) {
        nodeLists = nodeLists.concat(targetsToSources[node.id].map(function(sourceId) {
            return sourcesToTargets[sourceId];
        }));
    }

    var nodeIdsToCounts = {};
    nodeLists.forEach(function(nodeList) {
        nodeList.forEach(function(nodeId) {
            if(!nodeIdsToCounts[nodeId]) {
                // Save the ID in the object because the ID key will be converted to a String which will cause an issue if the node ID is a Number.
                nodeIdsToCounts[nodeId] = {
                    id: nodeId,
                    count: 0
                };
            }
            nodeIdsToCounts[nodeId].count++;
        });
    });

    var nodeIdsForCluster = [];
    Object.keys(nodeIdsToCounts).forEach(function(nodeIdKey) {
        var nodeId = nodeIdsToCounts[nodeIdKey].id;
        if(nodeIdsToCounts[nodeIdKey].count === nodeLists.length) {
            if(!sourcesToTargets[nodeId] || node.numberOfTargets === sourcesToTargets[nodeId].length) {
                if(!targetsToSources[nodeId] || node.numberOfSources === targetsToSources[nodeId].length) {
                    nodeIdsForCluster.push(nodeId);
                }
            }
        }
    });

    return nodeIdsForCluster.indexOf(node.id) >= 0 ? nodeIdsForCluster : [];
};

/**
 * Adds a new cluster node to the given list of nodes using the given cluster ID or adds a node to the existing cluster node with that ID.  Returns the ID of the cluster node.
 * @param {Array} nodes
 * @param {Number} clusterId The ID of the new or existing cluster node.
 * @param {Object} nodeToCluster The node to add to the cluster.
 * @param {Object} nodeIdsToClusterIds The mapping of node IDs to existing cluster IDs.
 * @method addCluster
 * @private
 * @return {Number}
 */
var addCluster = function(nodes, clusterId, nodeToCluster, nodeIdsToClusterIds) {
    var cluster = _.find(nodes, function(node) {
        return node.type === mediators.DirectedGraphMediator.CLUSTER_TYPE && node.id === clusterId;
    });
    if(!cluster) {
        cluster = createNode(clusterId, null, mediators.DirectedGraphMediator.CLUSTER_TYPE, nodeToCluster.size, nodeToCluster.dates);
        cluster.nodes = [nodeToCluster];
        nodes.push(cluster);
    } else {
        cluster.nodes.push(nodeToCluster);
        cluster.size += nodeToCluster.size;
        cluster.dates = cluster.dates.concat(nodeToCluster.dates);
        sortNodeDates(cluster);
    }
    nodeIdsToClusterIds[nodeToCluster.id] = clusterId;
    return clusterId;
};

/**
 * Returns whether to add to the graph the node with the given ID and multiple links to other nodes.
 * @param {Number} or {String} id The ID of the node in question.
 * @param {Object} map The mapping from the node in question to two or more other nodes (sourcesToTargets or targetsToSources).
 * @param {Object} reverseMap The reverse mapping.
 * @param {Boolean} hasSelected Whether the graph has selected nodes.
 * @param {Boolean} hideSimpleNetworks Whether to hide simple networks containing zero or one link.
 * @param {Object} nodeIdsToFlags The mapping of node IDs to whether they are flagged.
 * @method shouldAddMultipleLinkNode
 * @private
 * @return {Boolean}
 */
var shouldAddMultipleLinkNode = function(id, map, reverseMap, hasSelected, hideSimpleNetworks, nodeIdsToFlags) {
    if(!hasSelected && hideSimpleNetworks) {
        return map[id].filter(function(otherId) {
            return map[otherId] || reverseMap[otherId].length > 1 || nodeIdsToFlags[otherId];
        }).length > 0;
    }
    return true;
};

/**
 * Returns the number of nodes that would be contained within a cluster node that would be linked to the node with the given ID.
 * Cluster nodes should contain more than one node.
 * @param {Number} or {String} id The ID of the node linked to the cluster node in question.
 * @param {Object} map The mapping from the given ID to the cluster node in question (sourcesToTargets or targetsToSources).
 * @param {Object} reverseMap The reverse mapping.
 * @method findNumberOfNodesToCluster
 * @private
 * @return {Number}
 */
var findNumberOfNodesToCluster = function(id, map, reverseMap) {
    return map[id].filter(function(otherId) {
        return !map[otherId] && reverseMap[otherId].length === 1;
    }).length;
};

/**
 * Returns whether to add to the graph the cluster node linked to the node with the given ID.
 * @param {Number} or {String} id The ID of the node linked to the cluster node in question.
 * @param {Object} map The mapping from the given ID to the cluster node in question (sourcesToTargets or targetsToSources).
 * @param {Object} reverseMap The reverse mapping.
 * @param {Number} numberOfNodesToCluster The number of nodes that would be contained within the cluster node.
 * @param {Boolean} hasSelected Whether the graph has selected nodes.
 * @param {Boolean} hideSimpleNetworks Whether to hide simple networks containing zero or one link.
 * @param {Object} nodeIdsToFlags The mapping of node IDs to whether they are flagged.
 * @method shouldAddClusterNode
 * @private
 * @return {Boolean}
 */
var shouldAddClusterNode = function(id, map, reverseMap, numberOfNodesToCluster, hasSelected, hideSimpleNetworks, nodeIdsToFlags) {
    return hasSelected || !hideSimpleNetworks || nodeIdsToFlags[id] || numberOfNodesToCluster !== map[id].length || reverseMap[id];
};

/**
 * Returns whether to add to the graph the node only linked to the node with the given ID.
 * @param {Number} or {String} id The ID of the node linked to the node in question.
 * @param {Object} map The mapping from the given ID to the node in question (sourcesToTargets or targetsToSources).
 * @param {Boolean} hasSelected Whether the graph has selected nodes.
 * @param {Boolean} hideSimpleNetworks Whether to hide simple networks containing zero or one link.
 * @param {Object} nodeIdsToFlags The mapping of node IDs to whether they are flagged.
 * @method shouldAddSingleLinkNode
 * @private
 * @return {Boolean}
 */
var shouldAddSingleLinkNode = function(id, map, hasSelected, hideSimpleNetworks, nodeIdsToFlags) {
    return hasSelected || !hideSimpleNetworks || nodeIdsToFlags[id] || map[id].length > 1;
};

/**
 * Sets the network IDs for the given nodes.  Creates and returns the array of links containing indices for the source and target nodes using the
 * given list of nodes and links containing source and target node IDs.
 * @param {Array} nodes
 * @param {Array} links
 * @param {Object} maps Containing {Object} nodeIdsToClusterIds, {Object} nodeIdsToNetworkIds, {Object} networkIdsToNodeIds, and {Object} sourcesToTargetsToLinkDates.
 * @param {Object} selected Containing {Array} graphNodeIds.
 * @method finalizeNetworksAndCreateLinks
 * @private
 * @return {Array}
 */
var finalizeNetworksAndCreateLinks = function(nodes, links, maps, selected) {
    // While the input links connect source node IDs to target node IDs, D3 links must connect source node index to target node index.
    var resultLinks = [];

    // Give each individual node network a unique ID.
    var nextFreeNetworkId = 1;

    // Maps link source indices to link target indices to true to avoid creating duplicate links.
    var linksCreated = {};

    links.forEach(function(link) {
        var sourceId = maps.nodeIdsToClusterIds[link.sourceId] || link.sourceId;
        var sourceType = maps.nodeIdsToClusterIds[link.sourceId] ? mediators.DirectedGraphMediator.CLUSTER_TYPE : mediators.DirectedGraphMediator.NODE_TYPE;
        var sourceIndex = _.findIndex(nodes, function(node) {
            return node.id === sourceId && node.type === sourceType;
        });
        var targetId = maps.nodeIdsToClusterIds[link.targetId] || link.targetId;
        var targetType = maps.nodeIdsToClusterIds[link.targetId] ? mediators.DirectedGraphMediator.CLUSTER_TYPE : mediators.DirectedGraphMediator.NODE_TYPE;
        var targetIndex = _.findIndex(nodes, function(node) {
            return node.id === targetId && node.type === targetType;
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
                resultLinks.forEach(function(indexLink) {
                    if(indexLink.network === oldNetworkId) {
                        indexLink.network = sourceNode.network;
                    }
                });
            }

            // If we're loading the graph to show a selected network of nodes, set the selected network ID to the node's network ID.
            if(selected.graphNodeIds.length) {
                selected.graphNetworkId = sourceNode.network;
            }

            saveNodeIdAndNetworkIdMappings(sourceNode, maps.nodeIdsToNetworkIds, maps.networkIdsToNodeIds);
            saveNodeIdAndNetworkIdMappings(targetNode, maps.nodeIdsToNetworkIds, maps.networkIdsToNodeIds);

            var dates = [];
            if(sourceNode.type !== mediators.DirectedGraphMediator.CLUSTER_TYPE && targetNode.type !== mediators.DirectedGraphMediator.CLUSTER_TYPE) {
                dates = maps.sourcesToTargetsToLinkDates[sourceNode.id][targetNode.id];
            } else if(sourceNode.type === mediators.DirectedGraphMediator.CLUSTER_TYPE && targetNode.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
                sourceNode.nodes.forEach(function(sourceNodeInCluster) {
                    targetNode.nodes.forEach(function(targetNodeInCluster) {
                        dates = dates.concat(maps.sourcesToTargetsToLinkDates[sourceNodeInCluster.id][targetNodeInCluster.id]);
                    });
                });
            } else if(sourceNode.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
                sourceNode.nodes.forEach(function(nodeInCluster) {
                    dates = dates.concat(maps.sourcesToTargetsToLinkDates[nodeInCluster.id][targetNode.id]);
                });
            } else if(targetNode.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
                targetNode.nodes.forEach(function(nodeInCluster) {
                    dates = dates.concat(maps.sourcesToTargetsToLinkDates[sourceNode.id][nodeInCluster.id]);
                });
            }

            if(!linksCreated[sourceIndex] || !linksCreated[sourceIndex][targetIndex]) {
                resultLinks.push({
                    source: sourceIndex,
                    target: targetIndex,
                    dates: dates,
                    network: sourceNode.network,
                    key: createLinkKey(sourceId, sourceType, targetId, targetType)
                });
                if(!linksCreated[sourceIndex]) {
                    linksCreated[sourceIndex] = {};
                }
                linksCreated[sourceIndex][targetIndex] = true;
            }
        }
    });

    return resultLinks;
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
    if(node.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
        node.nodes.forEach(function(nodeInCluster) {
            setNodeNetworkId(nodeInCluster, networkId);
        });
    }
};

/**
 * Saves the node ID to network ID and network ID to node ID mappings of the given node in the given maps.  If the node is a cluster, also saves the mappings for all nodes in the cluster.
 * @param {Object} node
 * @param {Object} nodeIdsToNetworkIds
 * @param {Object} netowkrIdstoNodeIds
 * @method saveNodeIdAndNetworkIdMappings
 * @private
 */
var saveNodeIdAndNetworkIdMappings = function(node, nodeIdsToNetworkIds, networkIdsToNodeIds) {
    if(node.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
        node.nodes.forEach(function(nodeInCluster) {
            saveNodeIdAndNetworkIdMappings(nodeInCluster, nodeIdsToNetworkIds, networkIdsToNodeIds);
        });
    } else {
        nodeIdsToNetworkIds[node.id] = node.network;
        if(!networkIdsToNodeIds[node.network]) {
            networkIdsToNodeIds[node.network] = [];
        }
        networkIdsToNodeIds[node.network].push(node.id);
    }
};

/**
 * Sorts the given list of nodes or links by their earliest date.  Assumes the list of dates for each item is sorted.  Items with no dates will be sorted first.
 * @param nodes
 * @method sortNodeOrLinkListByDate
 * @private
 */
var sortNodeOrLinkListByDate = function(list) {
    list.sort(function(a, b) {
        if(!a.dates.length) {
            return -1;
        }
        if(!b.dates.length) {
            return 1;
        }
        return a.dates[0].getTime() - b.dates[0].getTime();
    });
};

/**
 * Initializes the date bucket maps in the given maps object for the given node and link data using the given bucketizer.
 * @param {Array} nodes
 * @param {Array} links
 * @param {Object} bucketizer
 * @param {Object} maps
 * @method initializeDateBuckets
 * @private
 */
var initializeDateBuckets = function(nodes, links, bucketizer, maps) {
    maps.dateBucketsToNodeIndices = createDateBucketMap(bucketizer);
    maps.dateBucketsToLinkIndices = createDateBucketMap(bucketizer);

    if(bucketizer && bucketizer.getStartDate() && bucketizer.getEndDate()) {
        var numberOfBuckets = bucketizer.getNumBuckets();

        nodes.forEach(function(node, index) {
            var bucket = node.dates[0] ? bucketizer.getBucketIndex(node.dates[0]) : 0;
            for(var i = bucket; i < numberOfBuckets; ++i) {
                maps.dateBucketsToNodeIndices[i] = index + 1;
            }

            // If the node is a cluster containing its own nodes, create a date bucket map for the cluster.
            if(node.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
                node.dateBucketsToNodeIndices = createDateBucketMap(bucketizer);
                node.nodes.forEach(function(nodeInCluster, indexInCluster) {
                    var bucketInCluster = nodeInCluster.dates[0] ? bucketizer.getBucketIndex(nodeInCluster.dates[0]) : 0;
                    for(var j = bucketInCluster; j < numberOfBuckets; ++j) {
                        node.dateBucketsToNodeIndices[j] = indexInCluster + 1;
                    }
                });
                node.nodesForSelectedDateBucket = node.nodes;
            }
        });

        links.forEach(function(link, index) {
            var bucket = link.dates[0] ? bucketizer.getBucketIndex(link.dates[0]) : 0;
            for(var k = bucket; k < numberOfBuckets; ++k) {
                maps.dateBucketsToLinkIndices[k] = index + 1;
            }
        });
    }
};

/**
 * Creates and returns a map containing keys for each date bucket in the given bucketizer.
 * @param {Object} bucketizer
 * @method createDateBucketMap
 * @private
 * @return {Object}
 */
var createDateBucketMap = function(bucketizer) {
    var dateBucketMap = {};

    if(bucketizer && bucketizer.getStartDate() && bucketizer.getEndDate()) {
        var numberOfBuckets = bucketizer.getNumBuckets();
        for(var i = 0; i < numberOfBuckets; ++i) {
            dateBucketMap[i] = 0;
        }
    }

    return dateBucketMap;
};

/**
 * Saves the given nodes and links and updates the network graph using the data.
 * @param {Array} nodes
 * @param {Array} links
 * @method saveDataAndUpdateGraph
 */
mediators.DirectedGraphMediator.prototype.saveDataAndUpdateGraph = function(nodes, links) {
    this.graphNodes = nodes;
    this.graphLinks = links;
    this.graph.updateGraph({
        nodes: this.graphNodes,
        links: this.graphLinks
    });
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
 * Returns the function for calculating the size of a node.
 * @param {Object} mediator
 * @method createFunctionToCalculateNodeSize
 * @return {Function}
 */
var createFunctionToCalculateNodeSize = function(mediator) {
    return function(node) {
        var size = 0;
        if(node.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
            var nodesInCluster = mediator.selected.dateBucket ? node.nodesForSelectedDateBucket : node.nodes;
            nodesInCluster.forEach(function(nodeInCluster) {
                size += nodeInCluster.size ? nodeInCluster.size : getNumberOfDatesInBucket(nodeInCluster, mediator.bucketizer, mediator.selected.dateBucket);
            });
        } else {
            size = node.size ? node.size : getNumberOfDatesInBucket(node, mediator.bucketizer, mediator.selected.dateBucket);
        }
        return 10 + Math.min(20, calculateSizeLogValue(size, 2.0));
    };
};

/**
 * Returns the number of dates in the given node or link object before or in the given date bucket using the given bucketizer (or all the dates if the date bucket is undefined).
 * @param {Object} object
 * @param {Object} bucketizer
 * @param {Number} dateBucket
 * @method getNumberOfDatesInBucket
 * @private
 * @return {Number}
 */
var getNumberOfDatesInBucket = function(object, bucketizer, dateBucket) {
    if(bucketizer && dateBucket) {
        var index = _.findIndex(object.dates, function(date, index) {
            return bucketizer.getBucketIndex(date) > dateBucket;
        }) || object.dates.length;
        return object.dates.slice(0, index).length;
    }
    return object.dates.length;
};

/**
 * Returns the log value used to calculate the size of nodes in the graph.
 * @param {Number} size
 * @param {Number} multiplier
 * @method calculateSizeLogValue
 * @private
 * @return {Number}
 */
var calculateSizeLogValue = function(size, multiplier) {
    var log10 = size ? Math.log10(size) : 0;
    var floor = Math.floor(log10);
    var round = Math.round(log10);
    return floor === round ? multiplier * floor : multiplier * floor + Math.floor(multiplier / 2.0);
};

/**
 * Returns the function for calculating the color of a node.
 * @param {Object} mediator
 * @method createFunctionToCalculateNodeColor
 * @private
 * @return {Function}
 */
var createFunctionToCalculateNodeColor = function(mediator) {
    return function(node) {
        if(node.type !== mediators.DirectedGraphMediator.CLUSTER_TYPE && (mediator.selected.mouseoverNodeIds.indexOf(node.id) >= 0 || mediator.selected.graphNodeIds.indexOf(node.id) >= 0)) {
            return mediators.DirectedGraphMediator.FOCUSED_COLOR;
        }
        if(node.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
            var nodesInCluster = mediator.selected.dateBucket ? node.nodesForSelectedDateBucket : node.nodes;
            if(mediator.selected.mouseoverNodeIds.indexOf(nodesInCluster[0].id) >= 0 || mediator.selected.graphNodeIds.indexOf(nodesInCluster[0].id) >= 0) {
                return mediators.DirectedGraphMediator.FOCUSED_COLOR;
            }
            return mediators.DirectedGraphMediator.CLUSTER_COLOR;
        }
        return node.flag ? mediators.DirectedGraphMediator.FLAGGED_COLOR : (node.inData ? mediators.DirectedGraphMediator.DEFAULT_COLOR : mediators.DirectedGraphMediator.MISSING_COLOR);
    };
};

/**
 * Returns the function for calculating the opacity of a node.
 * @param {Object} mediator
 * @method createFunctionToCalculateNodeOpacity
 * @private
 * @return {Function}
 */
var createFunctionToCalculateNodeOpacity = function(mediator) {
    return function(node) {
        if(mediator.selected.mouseoverNetworkId && mediator.selected.mouseoverNetworkId !== node.network) {
            return mediator.graph.DEFAULT_NODE_OPACITY / 2;
        }
        if(mediator.selected.graphNetworkId && mediator.selected.graphNetworkId !== node.network) {
            return mediator.graph.DEFAULT_NODE_OPACITY / 2;
        }
        return mediator.graph.DEFAULT_NODE_OPACITY;
    };
};

/**
 * Returns the function for generating the text for a node.
 * @param {Object} mediator
 * @method createFunctionToGenerateNodeText
 * @private
 * @return {Function}
 */
var createFunctionToGenerateNodeText = function(mediator) {
    return function(node) {
        if(node.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
            var nodesInCluster = mediator.selected.dateBucket ? node.nodesForSelectedDateBucket : node.nodes;
            return nodesInCluster.length;
        }
        return "";
    };
};

/**
 * Returns the function for generating the tooltip for a node.
 * @param {Object} mediator
 * @method createFunctionToGenerateNodeTooltip
 * @private
 * @return {Function}
 */
var createFunctionToGenerateNodeTooltip = function(mediator) {
    return function(node) {
        if(node.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
            var nodesInCluster = mediator.selected.dateBucket ? node.nodesForSelectedDateBucket : node.nodes;
            return '<div class="graph-tooltip-block">' +
                '<span class="graph-tooltip-label">Cluster of </span><span class="graph-tooltip-value">' + nodesInCluster.length + '</span>' +
                '</div>';
        }

        var text = '<div class="graph-tooltip-block">' +
            '<span class="graph-tooltip-label">' + mediator.tooltip.idLabel + '</span>' +
            '<span class="graph-tooltip-value">' + node.id + '</span>' +
            '</div>' +
            '<div class="graph-tooltip-block">' +
            '<span class="graph-tooltip-label">' + mediator.tooltip.dataLabel + '</span>' +
            '<span class="graph-tooltip-value">' + getNumberOfDatesInBucket(node, mediator.bucketizer, mediator.selected.dateBucket) + '</span>' +
            '</div>';

        if(mediator.options.nameField) {
            text = '<div class="graph-tooltip-block">' +
                '<span class="graph-tooltip-label">' + mediator.tooltip.nameLabel + '</span>' +
                '<span class="graph-tooltip-value">' + node.name + '</span>' +
                '</div>' + text;
        }

        if(mediator.options.sizeField) {
            text += '<div class="graph-tooltip-block">' +
                '<span class="graph-tooltip-label">' + mediator.tooltip.sizeLabel + '</span>' +
                '<span class="graph-tooltip-value">' + node.size + '</span>' +
                '</div>';
        }

        text += '<div class="graph-tooltip-block">' +
            '<span class="graph-tooltip-label">' + mediator.tooltip.sourceSizeLabel + '</span>' +
            '<span class="graph-tooltip-value">' + node.numberOfSources + '</span>' +
            '</div>' +
            '<div class="graph-tooltip-block">' +
            '<span class="graph-tooltip-label">' + mediator.tooltip.targetSizeLabel + '</span>' +
            '<span class="graph-tooltip-value">' + node.numberOfTargets + '</span>' +
            '</div>';

        if(node.type !== mediators.DirectedGraphMediator.CLUSTER_TYPE && mediator.maps.nodeIdsToFlags[node.id]) {
            text += '<div class="graph-tooltip-block">' +
                '<span class="graph-tooltip-label">' + mediator.tooltip.flagLabel + '</span>' +
                '</div>';
        };

        return text;
    };
};

/**
 * Returns the function for calculating the size of a link.
 * @param {Object} mediator
 * @method createFunctionToCalculateLinkSize
 * @private
 * @return {Function}
 */
var createFunctionToCalculateLinkSize = function(mediator) {
    return function(link) {
        return 2 + Math.min(10, calculateSizeLogValue(getNumberOfDatesInBucket(link, mediator.bucketizer, mediator.selected.dateBucket), 1.0));
    };
};

/**
 * Returns the function for calculating the color of a link.
 * @param {Object} mediator
 * @method createFunctionToCalculateLinkColor
 * @private
 * @return {Function}
 */
var createFunctionToCalculateLinkColor = function(mediator) {
    return function(link) {
        if(mediator.selected.mouseoverNetworkId === link.network || mediator.selected.graphNetworkId === link.network) {
            return mediators.DirectedGraphMediator.FOCUSED_COLOR;
        }
        return mediator.graph.DEFAULT_LINK_STROKE_COLOR;
    };
};

/**
 * Returns the function for calculating the opacity of a link.
 * @param {Object} mediator
 * @method createFunctionToCalculateLinkOpacity
 * @private
 * @return {Function}
 */
var createFunctionToCalculateLinkOpacity = function(mediator) {
    return function(link) {
        return mediator.graph.DEFAULT_LINK_STROKE_OPACITY;
    };
};

/**
 * Returns the function for finding the name of the arrowhead marker for a link.
 * @param {Object} mediator
 * @method createFunctionToFindLinkArrowhead
 * @private
 * @return {Function}
 */
var createFunctionToFindLinkArrowhead = function(mediator) {
    return function(link) {
        if(mediator.selected.mouseoverNetworkId === link.network || mediator.selected.graphNetworkId === link.network) {
            return mediators.DirectedGraphMediator.FOCUSED_COLOR_ARROWHEAD;
        }
        return mediator.graph.DEFAULT_LINK_ARROWHEAD;
    };
};

/**
 * Returns the function for generating the tooltip for a link.
 * @param {Object} mediator
 * @method createFunctionToGenerateLinkTooltip
 * @private
 * @return {Function}
 */
var createFunctionToGenerateLinkTooltip = function(mediator) {
    return function(link) {
        var sourceText = '<span class="graph-tooltip-value">' + link.source.name + '</span>';
        if(link.source.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
            var nodesInCluster = mediator.selected.dateBucket ? link.source.nodesForSelectedDateBucket : link.source.nodes;
            sourceText = '<span class="graph-tooltip-label">Cluster of </span><span class="graph-tooltip-value">' + nodesInCluster.length + '</span>';
        }
        var targetText = '<span class="graph-tooltip-value">' + link.target.name + '</span>';
        if(link.target.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
            var nodesInCluster = mediator.selected.dateBucket ? link.target.nodesForSelectedDateBucket : link.target.nodes;
            targetText = '<span class="graph-tooltip-label">Cluster of </span><span class="graph-tooltip-value">' + nodesInCluster.length + '</span>';
        }

        return '<div class="graph-tooltip-block">' +
            '<span class="graph-tooltip-label">' + mediator.tooltip.sourceNameLabel + '</span>' + sourceText +
            '</div>' +
            '<div class="graph-tooltip-block">' +
            '<span class="graph-tooltip-label">' + mediator.tooltip.targetNameLabel + '</span>' + targetText +
            '</div>' +
            '<div class="graph-tooltip-block">' +
            '<span class="graph-tooltip-label">' + mediator.tooltip.dataLabel + '</span>' +
            '<span class="graph-tooltip-value">' + getNumberOfDatesInBucket(link, mediator.bucketizer, mediator.selected.dateBucket) + '</span>' +
            '</div>';
    };
};

/**
 * Returns the function for selecting the network of a node if it is not selected.
 * @param {Object} mediator
 * @method createFunctionToHandleNodeSelect
 * @private
 * @return {Function}
 */
var createFunctionToHandleNodeSelect = function(mediator) {
    return function(node) {
        mediator.selected.mouseoverNodeIds = getNodeIds(node);
        mediator.selected.mouseoverNetworkId = node.network;
        mediator.graph.redrawNodesAndLinks();
    };
};

/**
 * Returns an array containing the ID of the given node.  If the given node is a cluster, returns an array containing the IDs of all of the nodes in the cluster.
 * @param {Object} node
 * @method getNodeIds
 * @private
 * @return {Array}
 */
var getNodeIds = function(node) {
    if(node.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
        // Note:  Return the IDs for all nodes in the cluster, not just the IDs for nodes in or before the selected date bucket.
        return node.nodes.map(function(nodeInCluster) {
            return nodeInCluster.id;
        });
    }
    return [node.id];
};

/**
 * Returns the function for deselecting the network of a node if it is selected.
 * @param {Object} mediator
 * @method createFunctionToHandleNodeDeselect
 * @private
 * @return {Function}
 */
var createFunctionToHandleNodeDeselect = function(mediator) {
    return function(node) {
        mediator.selected.mouseoverNodeIds = [];
        mediator.selected.mouseoverNetworkId = undefined;
        mediator.graph.redrawNodesAndLinks();
    };
};

/**
 * Returns the function for selecting or deselecting the network of a node.
 * @param {Object} mediator
 * @method createFunctionToHandleNodeClick
 * @private
 * @return {Function}
 */
var createFunctionToHandleNodeClick = function(mediator) {
    return function(node) {
        addSelectedNode(mediator.selected, node, true);
        mediator.callbacks.redrawGraph();
        mediator.callbacks.updateSelectedNodeIds();
    };
};

/**
 * Selects the given node and its network.  Deselects the given node if it is selected and deselectSelected is true.
 * @param {Object} selected Containing {Array} graphNodeIds and {Number} graphNetworkId.
 * @param {Object} node The node to select.
 * @param {Boolean} deselectSelected (optional)
 * @method addSelectedNode
 * @private
 */
var addSelectedNode = function(selected, node, deselectSelected) {
    if(node.type === mediators.DirectedGraphMediator.CLUSTER_TYPE) {
        var mediator = this;
        // Note:  Add the IDs for all nodes in the cluster, not just the IDs for nodes in or before the selected date bucket.
        node.nodes.forEach(function(nodeInCluster) {
            addSelectedNode(selected, nodeInCluster, deselectSelected);
        });
    } else {
        addSelectedNodeAndNetwork(selected, node.id, node.network, deselectSelected);
    }
};

/**
 * Selects the node and network with the given IDs.  Deselects the node with the given ID if it is selected and deselectSelected is true.
 * @param {Object} selected Containing {Array} graphNodeIds and {Number} graphNetworkId.
 * @param {Number} or {String} nodeId
 * @param {Number} networkId
 * @param {Boolean} deselectSelected (optional)
 * @method addSelectedNodeAndNetwork
 * @private
 */
var addSelectedNodeAndNetwork = function(selected, nodeId, networkId, deselectSelected) {
    if(selected.graphNetworkId !== networkId) {
        selected.graphNodeIds = [];
    }
    selected.graphNetworkId = networkId;

    var index = selected.graphNodeIds.indexOf(nodeId);
    if(index >= 0 && deselectSelected) {
        selected.graphNodeIds.splice(index, 1);
        if(!selected.graphNodeIds.length) {
            selected.graphNetworkId = undefined;
        }
    }

    if(index < 0) {
        selected.graphNodeIds.push(nodeId);
    }
};

/**
 * Returns the function for selecting the network of a link if it is not selected.
 * @param {Object} mediator
 * @method createFunctionToHandleLinkSelect
 * @private
 * @return {Function}
 */
var createFunctionToHandleLinkSelect = function(mediator) {
    return function(link) {
        mediator.selected.mouseoverNodeIds = getNodeIds(link.source).concat(getNodeIds(link.target));
        mediator.selected.mouseoverNetworkId = link.network;
        mediator.graph.redrawNodesAndLinks();
    };
};

/**
 * Returns the function for deselecting the network of a link if it is selected.
 * @param {Object} mediator
 * @method createFunctionToHandleLinkDeselect
 * @private
 * @return {Function}
 */
var createFunctionToHandleLinkDeselect = function(mediator) {
    return function(link) {
        mediator.selected.mouseoverNodeIds = [];
        mediator.selected.mouseoverNetworkId = undefined;
        mediator.graph.redrawNodesAndLinks();
    };
};

/**
 * Returns the function for selecting or deselecting the network of a link.
 * @param {Object} link
 * @method createFunctionToHandleLinkClick
 * @private
 * @return {Function}
 */
var createFunctionToHandleLinkClick = function(mediator) {
    return function(link) {
        addSelectedNode(mediator.selected, link.source);
        addSelectedNode(mediator.selected, link.target);
        mediator.callbacks.redrawGraph();
        mediator.callbacks.updateSelectedNodeIds();
    };
};

/**
 * Deselects all selected nodes and the selected node network in the graph.
 * @method deselectAllNodesAndNetwork
 */
mediators.DirectedGraphMediator.prototype.deselectAllNodesAndNetwork = function() {
    this.selected.graphNetworkId = undefined;
    this.selected.graphNodeIds = [];
    this.graph.redrawNodesAndLinks();
};

/**
 * Selects the node in the graph with the given ID and its network.
 * @param {Object} selectedNodeId
 * @method selectNodeAndNetworkFromNodeId
 */
mediators.DirectedGraphMediator.prototype.selectNodeAndNetworkFromNodeId = function(selectedNodeId) {
    if(selectedNodeId !== "") {
        var nodeId = Number(selectedNodeId) ? Number(selectedNodeId) : selectedNodeId;
        var networkId = this.maps.nodeIdsToNetworkIds[nodeId];

        if(networkId !== undefined && this.selected.graphNodeIds.indexOf(nodeId) < 0) {
            addSelectedNodeAndNetwork(this.selected, nodeId, networkId);
            this.graph.redrawNodesAndLinks();
        }
    }
};

/**
 * Selects the given date in the graph.
 * @param {Date} date
 * @method selectDate
 */
mediators.DirectedGraphMediator.prototype.selectDate = function(date) {
    if(!date && !this.selected.dateBucket || !this.bucketizer || !this.bucketizer.getStartDate() || !this.bucketizer.getEndDate() || !this.graphNodes) {
        return;
    }

    var bucket = undefined;
    var nodes = this.graphNodes;
    var links = this.graphLinks;

    if(date) {
        bucket = this.bucketizer.getBucketIndex(date);
        if(bucket === this.selected.dateBucket) {
            return;
        }

        nodes = this.graphNodes.slice(0, this.maps.dateBucketsToNodeIndices[bucket]);
        nodes.forEach(function(node) {
            if(node.dateBucketsToNodeIndices && node.nodes) {
                node.nodesForSelectedDateBucket = node.nodes.slice(0, node.dateBucketsToNodeIndices[bucket]);
            }
        });

        links = this.graphLinks.slice(0, this.maps.dateBucketsToLinkIndices[bucket]);
    }

    this.selected.dateBucket = bucket;

    this.graph.updateGraph({
        nodes: nodes,
        links: links
    });

    if(this.selected.dateBucket) {
        var mediator = this;
        // Pulse all nodes that occur (contain a date) in the selected date bucket.
        this.graph.pulseNodes(function(node) {
            return _.find(node.dates, function(date) {
                return mediator.bucketizer.getBucketIndex(date) === mediator.selected.dateBucket;
            });
        });
    }
};

/**
 * Redraws the nodes and links in the graph, updating their styling.
 * @method redrawGraph
 */
mediators.DirectedGraphMediator.prototype.redrawGraph = function() {
    this.graph.redrawNodesAndLinks();
};

/**
 * Sets the bucketizer to the given bucketizer and updates the date buckets using the new bucketizer.
 * @param {Object} bucketizer
 * @method setBucketizer
 */
mediators.DirectedGraphMediator.prototype.setBucketizer = function(bucketizer) {
    this.bucketizer = bucketizer;
    initializeDateBuckets(this.graphNodes, this.graphLinks, this.bucketizer, this.maps);
};

/**
 * Sets the selected graph node IDs to the given graph node IDs.
 * @param {Array} graphNodeIds
 * @method setSelectedNodeIds
 */
mediators.DirectedGraphMediator.prototype.setSelectedNodeIds = function(graphNodeIds) {
    this.selected.graphNodeIds = graphNodeIds;
};

/**
 * Sets the tooltip to a new object using fields from the given tooltip.
 * @param {Object} tooltip
 * @method setTooltip
 */
mediators.DirectedGraphMediator.prototype.setTooltip = function(tooltip) {
    this.tooltip = {
        idLabel: tooltip.idLabel || mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_ID_LABEL,
        dataLabel: tooltip.dataLabel || mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_DATA_LABEL,
        nameLabel: tooltip.nameLabel || mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_NAME_LABEL,
        sizeLabel: tooltip.sizeLabel || mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_SIZE_LABEL,
        flagLabel: tooltip.flagLabel || mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_FLAG_LABEL,
        sourceNameLabel: tooltip.sourceNameLabel || mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_SOURCE_LABEL,
        targetNameLabel: tooltip.targetNameLabel || mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_TARGET_LABEL,
        sourceSizeLabel: tooltip.sourceSizeLabel || mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_SOURCE_LABEL,
        targetSizeLabel: tooltip.targetSizeLabel || mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_TARGET_LABEL
    };
};

/**
 * Returns the selected graph node IDs.
 * @method getSelectedNodeIds
 * @return {Array}
 */
mediators.DirectedGraphMediator.prototype.getSelectedNodeIds = function() {
    return this.selected.graphNodeIds;
};

/**
 * Returns the full list of graph node IDs in the selected network (both the selected and unselected nodes).
 * @method getNodeIdsInSelectedNetwork
 * @return {Array}
 */
mediators.DirectedGraphMediator.prototype.getNodeIdsInSelectedNetwork = function() {
    return (this.selected.graphNetworkId ? (this.maps.networkIdsToNodeIds[this.selected.graphNetworkId] || []) : []);
};

/**
 * Returns the number of nodes in the graph.
 * @method getNumberOfNodes
 * @return {Number}
 */
mediators.DirectedGraphMediator.prototype.getNumberOfNodes = function() {
    return this.graphNodes.length;
};

/**
 * Returns the selected date bucket.
 * @method getSelectedDateBucket
 * @return {Number}
 */
mediators.DirectedGraphMediator.prototype.getSelectedDateBucket = function() {
    return this.selected.dateBucket;
};

/**
 * Creates nad returns a list of legend items using the given options.
 * @param {Boolean} useNodeCluster
 * @param {Boolean} useFlag
 * @param {String} flagLabel
 * @method createLegend
 * @return {Array}
 */
mediators.DirectedGraphMediator.prototype.createLegend = function(useNodeClusters, useFlag, flagLabel) {
    var legend = [{
        color: mediators.DirectedGraphMediator.DEFAULT_COLOR,
        label: mediators.DirectedGraphMediator.LEGEND_DEFAULT_LABEL
    }, {
        color: mediators.DirectedGraphMediator.MISSING_COLOR,
        label: mediators.DirectedGraphMediator.LEGEND_MISSING_LABEL
    }, {
        color: mediators.DirectedGraphMediator.FOCUSED_COLOR,
        label: mediators.DirectedGraphMediator.LEGEND_FOCUSED_LABEL
    }];

    if(useNodeClusters) {
        legend.push({
            color: mediators.DirectedGraphMediator.CLUSTER_COLOR,
            label: mediators.DirectedGraphMediator.LEGEND_CLUSTER_LABEL
        });
    }

    if(useFlag) {
        legend.push({
            color: mediators.DirectedGraphMediator.FLAGGED_COLOR,
            label: flagLabel || DEFAULT_TOOLTIP_FLAG_LABEL
        });
    }

    return legend;
};

mediators.DirectedGraphMediator.NODE_TYPE = "node";
mediators.DirectedGraphMediator.CLUSTER_TYPE = "cluster";

// Color codes copied from d3.scale.category10().
mediators.DirectedGraphMediator.DEFAULT_COLOR = "#1f77b4"; // blue
mediators.DirectedGraphMediator.CLUSTER_COLOR = "#9467bd"; // purple
mediators.DirectedGraphMediator.FLAGGED_COLOR = "#ff7f0e"; // orange
mediators.DirectedGraphMediator.FOCUSED_COLOR = "#2ca02c"; // green
mediators.DirectedGraphMediator.MISSING_COLOR = "#17becf"; // light blue

// Name for the arrowhead marker with the focused color.
mediators.DirectedGraphMediator.FOCUSED_COLOR_ARROWHEAD = "focused";

mediators.DirectedGraphMediator.FLAG_RESULT = "result";
mediators.DirectedGraphMediator.FLAG_LINKED = "linked";
mediators.DirectedGraphMediator.FLAG_ALL = "all";

mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_ID_LABEL = "";
mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_DATA_LABEL = "Items";
mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_SOURCE_LABEL = "From";
mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_TARGET_LABEL = "To";
mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_NAME_LABEL = "Name";
mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_SIZE_LABEL = "Size";
mediators.DirectedGraphMediator.DEFAULT_TOOLTIP_FLAG_LABEL = "Flagged";

mediators.DirectedGraphMediator.LEGEND_DEFAULT_LABEL = "In Data";
mediators.DirectedGraphMediator.LEGEND_MISSING_LABEL = "Filtered Out of Data";
mediators.DirectedGraphMediator.LEGEND_FOCUSED_LABEL = "Selected";
mediators.DirectedGraphMediator.LEGEND_CLUSTER_LABEL = "Clustered";
