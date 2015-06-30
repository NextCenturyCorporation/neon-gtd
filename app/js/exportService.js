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

    // This should match up with the value field of the entry that has selected initialized to true
    // in the formats array of fileFormats.js.
    var format = 0;

    // The limit clause with which to replace the limit clauses on queries when exporting.
    var limitClause = {
        limit: 100000
    };

    var service = {};

    // The current widget registration number. Incremented when a new widget is registered.
    var widgetNumber = -1;

    /**
     * Registers a function to this service, so that it can be executed as part of a bulk operation. Should be called by visualization
     * widgets upon being created.
     * @param bundleFunction {Function} The function to register.
     * @return {Number} The registration ID of the widget that called this method.
     */
    service.register = function(bundleFunction) {
        widgetNumber += 1;
        widgets.push({
            id: widgetNumber,
            callback: bundleFunction
        });
        return widgetNumber;
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
     * Sets the file format in which widgets should request exports, given as a number that corresponds to an extension (for a list of
     * numeric values and which file extensions they correspond to, check in fileFormats.js or ExportService.groovy).
     * @param {Number} fileFormat The new file format in which widgets should request exports.
     */
    service.setFileFormat = function(fileFormat) {
        format = fileFormat;
    };

    /**
     * Returns the numeric value of the file format in which widgets should request exports.
     * @return {Number} The file format in which widgets should request exports.
     */
    service.getFileFormat = function() {
        return format;
    };

    /**
     * Returns the limit clause that should be given to queries going to export.
     * We want to remove limits on data returned as much as possible, but also don't want to overwhelm the server's memory.
     * @return {Object} The limit clause that should be given to queries going to export.
     */
    service.getLimitClause = function() {
        return limitClause;
    };

    return service;
});
