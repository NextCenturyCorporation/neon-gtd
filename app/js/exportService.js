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
/**
 * This provides an Angular service for 
 *
 * @class neonDemo.services.ExportService
 * @constructor
 */
angular.module('neonDemo.services')
.factory('ExportService', function() {
    
    var widgets = [];
    var format = 'csv';

    var service = {};

    service.register = function(id, bundleFunction) {
        widgets.push({
            id: id,
            callback: bundleFunction
        });
    };

    service.unregister = function(uuid) {
        var x = widgets.length - 1;
        for(x; x >= 0; x--) {
            if((widgets[x]).id === uuid) {
                widgets.splice(x, 1);
            }
        }
    };

    service.getWidgets = function() {
        return widgets;
    };

    service.setFileFormat = function(fileFormat) {
        format = fileFormat;
    };

    service.getFileFormat = function() {
        return format;
    };

    return service;
});