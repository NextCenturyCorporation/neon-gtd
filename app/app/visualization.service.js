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
/**
 * This provides an Angular service for registering and unregistering visualizations on a page.
 *
 * @class neonDemo.services.VisualizationService
 * @constructor
 */
angular.module('neonDemo.services')
.factory('VisualizationService', function() {
    var widgets = [];

    var service = {};

    /**
     * Registers a function to this service, so that it can be executed as part of a bulk operation. Should be called by visualization
     * widgets upon being created.
     * @param {String} visualizationId The unique id for the visualization.
     * @param {Function} bundleFunction The function to register.
     * @method register
     */
    service.register = function(visualizationId, bundleFunction) {
        widgets.push({
            id: visualizationId,
            callback: bundleFunction
        });
    };

    /**
     * Unregisters a function with the given ID from this service. Should be called by visualization widgets upon being destroyed.
     * @param {String} visualizationId The unique ID of the function being unregistered.
     * @method unregister
     */
    service.unregister = function(visualizationId) {
        var index = _.findIndex(widgets, {
            id: visualizationId
        });
        widgets.splice(index, 1);
    };

    /**
     * Returns a list of all objects currently registered to this service, so the functions they have references to can
     * be used for bulk operations.
     * @return {Array} The list of objects subsrcibed to this service.
     * @method getWidgets
     */
    service.getWidgets = function() {
        return widgets;
    };

    return service;
});
