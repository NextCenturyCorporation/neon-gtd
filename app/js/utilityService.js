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
.factory("UtilityService",
    function() {
        var service = {};

        // Buffer needed above and below the options popover based on popover position, container padding (both set in the CSS), and UX.
        service.OPTIONS_POPOVER_BUFFER_Y = 65;

        service.createUniqueChartOptionsId = function(rootElement) {
            var id = "chart-options-" + uuid();
            rootElement.find(".chart-options").addClass(id);
            return id;
        };

        service.resizeOptionsPopover = function(rootElement) {
            var optionsPopover = rootElement.find(".chart-options");
            var height = rootElement.innerHeight() - (optionsPopover.outerHeight(true) - optionsPopover.height() + service.OPTIONS_POPOVER_BUFFER_Y);
            optionsPopover.find(".popover-content").css("max-height", height + "px");
        };

        return service;
    }
);
