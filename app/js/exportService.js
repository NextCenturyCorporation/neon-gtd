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
 * This provides an Angular service for registering and unregistering widgets on a page and their export methods, as well as getting those widgets
 * and getting/setting the type of file the page is set to export.
 *
 * @class neonDemo.services.ExportService
 * @constructor
 */
angular.module('neonDemo.services')
.factory('ExportService', function() {
    var widgets = [];

    // This should match up with the name field of the entry with "selected" initialized to true
    // in the formats array of fileFormats.js.
    var format = 'csv';

    var service = {};

    /**
     * Registers a function to this service, so that it can be executed as part of a bulk operation. Should be called by visualization
     * widgets upon being created.
     * @param uuid {String} The unique of ID of the registering widget, to be used as a key for unregistering.
     * @param bundleFunction {Function} The function to register.
     */
    service.register = function(uuid, bundleFunction) {
        widgets.push({
            id: uuid,
            callback: bundleFunction
        });
    };

    /**
     * Unregisters a function with the given ID from this service. Should be called by visualization widgets upon being destroyed.
     * @param uuid {String} The unique ID of the function being unregistered.
     */
    service.unregister = function(uuid) {
        var x = widgets.length - 1;
        for(x; x >= 0; x--) {
            if((widgets[x]).id === uuid) {
                widgets.splice(x, 1);
                return;
            }
        }
    };

    /**
     * Returns a list of all objects currently registered to this service, so the functions they have references to can
     * be used for bulk operations.
     * @return {Array} The list of objects subsrcibed to this service.
     */
    service.getWidgets = function() {
        return widgets;
    };

    /**
     * Sets the file format in which widgets should request exports - extension only, e.g. "csv".
     * @param {String} fileFormat The new file format in which widgets should request exports.
     */
    service.setFileFormat = function(fileFormat) {
        format = fileFormat;
    };

    /**
     * Returns the file format in which widgets should request exports.
     * @return {String} The file formats in which widgets should request exports.
     */
    service.getFileFormat = function() {
        return format;
    };

    return service;
});