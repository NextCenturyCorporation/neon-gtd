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

angular.module("neonDemo.services")
.factory("LineChartService", [function() {
    var service = {};
    service.ADD_OVERLAY_CHANNEL = "add_overlay";
    service.REFRESH_OVERLAYS_CHANNEL = "refresh_overlays";
    service.REMOVE_OVERLAY_CHANNEL = "remove_overlay";

    var lineCharts = [];

    var messenger = new neon.eventing.Messenger();

    /**
     * Add the give id and name to the list of charts.
     * @param {String} id
     * @param {String} name
     * @method setChart
     */
    service.setChart = function(id, name) {
        var index = _.findIndex(lineCharts, {
            id: id
        });

        if(index === -1) {
            lineCharts.push({
                name: name,
                id: id
            });
        } else {
            lineCharts[index].name = name;
        }
    };

    /**
     * Removes the chart with the given id from the list of charts.
     * @param {String} id
     * @method removeChart
     */
    service.removeChart = function(id) {
        var index = _.findIndex(lineCharts, {
            id: id
        });

        if(index >= 0) {
            lineCharts.splice(index, 1);
        }

        messenger.publish(service.REMOVE_OVERLAY_CHANNEL, {
            overlaySourceId: id,
            overlayTargetId: id
        });
    };

    /**
     * Retrieves the list of charts.
     * @return {Array}
     * @method getAllCharts
     */
    service.getAllCharts = function() {
        return lineCharts;
    };

    /**
     * Gets the chart info with the given id.
     * @param {String} id
     * @return {Object}
     * @method getChart
     */
    service.getChart = function(id) {
        var index = _.findIndex(lineCharts, {
            id: id
        });

        if(index >= 0) {
            return lineCharts[index];
        }

        return {};
    };

    /**
     * Adds an overlay to another chart.
     * @param {String} overlaySourceId The id of the chart the overlay data is coming from.
     * @param {String} overlayTargetId The id of the chart to add the overlay to.
     * @param {Object} data An object containing all the data necessary to draw the line graph, including the brush extent,
     * database name, and table name.
     * @method addOverlay
     */
    service.addOverlay = function(overlaySourceId, overlayTargetId, data) {
        messenger.publish(service.ADD_OVERLAY_CHANNEL, {
            overlaySourceId: overlaySourceId,
            overlayTargetId: overlayTargetId,
            data: data
        });
    };

    /**
     * Refreshes all charts that have a certain overlay.
     * @param {String} overlaySourceId The id of the chart the overlay data is coming from.
     * @param {Array} overlayTargetsData A list of objects containing the id of a chart the
     * overlay is on and a data object containing all the data neccessary to draw the line graph,
     * including the brush extent, database name, and table name.
     * @method refreshOverlays
     */
    service.refreshOverlays = function(overlaySourceId, overlayTargetsData) {
        messenger.publish(service.REFRESH_OVERLAYS_CHANNEL, {
            overlaySourceId: overlaySourceId,
            overlayTargetsData: overlayTargetsData
        });
    };

    /**
     * Removes an overlay from a chart.
     * @param {String} overlaySourceId The id of the chart the overlay is coming from.
     * @param {String} overlayTargetId The id of the chart to remove the overlay from.
     * @method removeOverlay
     */
    service.removeOverlay = function(overlaySourceId, overlayTargetId) {
        messenger.publish(service.REMOVE_OVERLAY_CHANNEL, {
            overlaySourceId: overlaySourceId,
            overlayTargetId: overlayTargetId
        });
    };

    return service;
}]);