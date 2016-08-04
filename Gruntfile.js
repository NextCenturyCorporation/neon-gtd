'use strict';
//
// Copyright 2016 Next Century Corporation
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

module.exports = function(grunt) {
    var packageJSON = require('./package.json');
    var versionJSONFile = 'client/app/config/version.json';

    grunt.initConfig({
        exec: {
            bower_install: {
                command: "bower install",
                stdout: false
            }
        },

        clean: {
            lib: ["client/bower_components"],
            docs: ["docs"],
            war: ["target"],
            tests: ["reports"],
            less: ["client/app/app.css"],
            dist: [".tmp", "dist"]
        },

        "git-describe": {
            options: {
                failOnError: false
            },
            neonGTDVersion: {
                tags: true,
                all: true,
                template: '{%=tag%}-{%=since%}-{%=object%}'
            }
        },

        // Injects the bower components into the <!-- bower --> blocks in our index.html file.
        wiredep: {
            app: {
                src: "client/index.html",
                directory: "client/bower_components",
                ignorePath: "client/",
                // The dependencies for these libraries are added to index.html manually.
                exclude: [
                    // Exclude ag-grid.js because it must be included after angular.js and wiredep may not order them correctly.
                    /ag-grid\.js/,
                    // Exclude angular-gantt because it defines incorrect files in the main of its bower.json file (should be dist/ not assets/).
                    /angular-gantt/,
                    // Exclude javascript-detect-element-resize because it defines its "pure js" lib in the main of its bower.json file and we use its "jquery plugin" lib.
                    /javascript-detect-element-resize/,
                    // Exclude angular-ui-tree.min.js because the non-minified js file is also included.
                    /angular-ui-tree\.min\.js/,
                    // Exclude html5shiv and respond because we only include them for old versions of IE.
                    /html5shiv/,
                    /respond/,
                    // Exclude the remaining libraries because they do not have bower.json files.
                    /underscore/,
                    /log4javascript/,
                    /node-uuid/,
                    /postal/,
                    /opencpu/,
                    /openlayers/,
                    /heatmapjs/,
                    /user-ale/,
                    /rainbowvis.js/
                ]
            }
        },

        eol: {
            dist: {
                options: {
                    eol: "lf",
                    replace: true
                },
                files: [{
                    src: ["dist/index.html"]
                }]
            }
        },

        injector: {
            js: {
                options: {
                    starttag: "<!-- injector:js -->",
                    endtag: "<!-- endinjector -->",
                    transform: function(filePath) {
                        // injector doesn't allow pattern matching in the ignorePath object, so check for *.spec.js files here to exclude them.
                        if(!filePath || filePath.match(/spec.js$/)) {
                            return '';
                        }
                        filePath = filePath.replace("/client/", "");
                        return '<script src="' + filePath + '"></script>';
                    },
                    ignorePath: [
                        'client/app/test.js'
                    ]
                },
                files: {
                    "client/index.html": [
                        "client/app/namespaces.js",
                        "client/app/neon.helpers.js",
                        "client/app/neonGTDSetup.js",
                        "client/app/app.js",
                        "client/app/*.service.js",
                        "client/app/main/main.controller.js",
                        "client/{app,components}/**/*.js"
                    ]
                }
            },

            less: {
                options: {
                    starttag: "/* injector:less */",
                    endtag: "/* endinjector */",
                    transform: function(filePath) {
                        filePath = filePath.replace("/client/app/", "");
                        filePath = filePath.replace("/client/components/", "../components/");
                        return '@import "' + filePath + '";';
                    }
                },
                files: {
                    "client/app/app.less": [
                        "client/{app,components}/**/*.less",
                        "!client/app/themes/*.less"
                    ]
                }
            }
        },

        less: {
            options: {
                dumpLineNumbers: 'comments'
            },
            themeDarkGreen: {
                files: {
                    'client/app/themes/dark-green.css': 'client/app/themes/theme-green-on-dark.less'
                }
            },
            themeLightGreen: {
                files: {
                    'client/app/themes/light-green.css': 'client/app/themes/theme-green-on-light.less'
                }
            },
            themeDarkPurple: {
                files: {
                    'client/app/themes/dark-purple.css': 'client/app/themes/theme-purple-on-dark.less'
                }
            }
        },

        // Packages all the images into a spritesheet and creates a CSS file for using the sprites.
        sprite: {
            app: {
                src: [
                    "client/assets/images/*.png",
                    "client/assets/images/visualizations/*.png",
                    "client/assets/images/visualizations/gray/*.png",
                    "!client/assets/images/spritesheet.png"
                ],
                dest: "client/assets/images/spritesheet.png",
                destCss: "client/app/sprites.css"
            }
        },

        // Prepares concatenation and minification of CSS and JS dependencies in our index.html file.
        // Automatically configures files for the concat, uglify, and cssmin tasks using the <!-- build --> blocks in our index.html.
        useminPrepare: {
            html: "client/index.html",
            options: {
                dest: "dist"
            }
        },

        // Copies concatenated, minified files into the build directory and inject dependencies into our index.html file.
        usemin: {
            html: ["dist/{,*/}*.html"],
            options: {
                assetsDirs: ["dist"]
            }
        },

        // Packages all the HTML partials into a JS file.
        ngtemplates: {
            options: {
                module: "neonDemo",
                // Add the template JS file to the list of JS files that the usemin task configured to concatenate.
                usemin: "dist/app/app.min.js"
                // TODO Use the htmlmin option when the html-minifier task fully supports angular (currently the task just hangs when run).
            },
            app: {
                cwd: "client/",
                src: ["{app,components}/**/*.html"],
                dest: "dist/app/templates.js"
            }
        },

        // Files for uglify are automatically configured by the useminPrepare task.
        uglify: {
            options: {
                mangle: false
            }
        },

        // Copy dependencies for third-party libraries (using their relative paths) and other Neon Dashboard files/folders for the production version.
        copy: {
            bootstrap: {
                expand: true,
                cwd: "client/bower_components/bootstrap/dist/",
                src: ["fonts/**", "css/bootstrap.min.css", "js/bootstrap.min.js"],
                dest: "dist/"
            },
            jquery_ui_lightness: {
                expand: true,
                cwd: "client/bower_components/jquery-ui/themes/ui-lightness",
                src: ["images/**"],
                dest: "dist/css/"
            },
            jquery_ui_smoothness: {
                expand: true,
                cwd: "client/bower_components/jquery-ui/themes/smoothness",
                src: ["images/**"],
                dest: "dist/css/"
            },
            openlayers: {
                expand: true,
                cwd: "client/",
                src: [
                    "bower_components/openlayers/OpenLayers.js",
                    "bower_components/openlayers/img/*",
                    "bower_components/openlayers/theme/default/style.css",
                    "bower_components/openlayers/theme/default/img/*"
                ],
                dest: "dist/"
            },
            userale: {
                expand: true,
                cwd: "client/",
                src: ["bower_components/user-ale/helper-libs/javascript/userale-worker.js"],
                dest: "dist/"
            },
            app: {
                expand: true,
                cwd: "client/",
                src: [
                    "index.html",
                    "app/config/**",
                    "app/help/**",
                    "app/themes/light-*.css",
                    "app/themes/dark-*.css",
                    "assets/fonts/**",
                    "assets/images/Neon_16x16.png",
                    "assets/images/spritesheet.png"
                ],
                dest: "dist/"
            }
        },

        jshint: {
            options: {
                jshintrc: '.jshintrc',
                force: true
            },
            console: [
                'Gruntfile.js',
                'e2e/',
                'client/app/*.js',
                'client/{app,components}/**/*.js'
            ],
            xml: {
                options: {
                    reporter: "jslint",
                    reporterOutput: "reports/jslint.xml"
                },
                files: {
                    src: [
                        'Gruntfile.js',
                        'e2e/',
                        'client/app/*.js',
                        'client/{app,components}/**/*.js'
                    ]
                }
            }
        },

        jscs: {
            options: {
                config: ".jscsrc",
                excludeFiles: ["client/assets/vendor/**/*.js"],
                force: true
            },
            console: {
                options: {
                    reporter: 'console'
                },
                files: {
                    src: ['Gruntfile.js', 'client/app/*.js', 'client/{app,components,test}/**/*.js']
                }
            },
            xml: {
                options: {
                    reporterOutput: 'reports/jscs.xml',
                    reporter: 'checkstyle'
                },
                files: {
                    src: ['Gruntfile.js', 'client/app/*.js', 'client/{app,components,test}/**/*.js']
                }
            }
        },

        karma: {
            unit: {
                options: {
                    configFile: 'karma.conf.js'
                }
            }
        },

        /*
         * Build a WAR (web archive) without Maven or the JVM installed.
         */
        war: {
            development: {
                options: {
                    war_dist_folder: "target",
                    war_verbose: true,
                    war_name: 'neon-gtd-dev-' + packageJSON.version,
                    webxml_welcome: 'index.html',
                    webxml_display_name: packageJSON.shortDescription,
                    webxml_mime_mapping: [{
                        extension: 'woff',
                        mime_type: 'application/font-woff'
                    }]
                },
                files: [{
                    expand: true,
                    cwd: "client/",
                    src: ["**", "!**/*.less"],
                    dest: "app/"
                }]
            },
            production: {
                options: {
                    war_dist_folder: "target",
                    war_verbose: true,
                    war_name: 'neon-gtd-' + packageJSON.version,
                    webxml_welcome: 'index.html',
                    webxml_display_name: packageJSON.shortDescription,
                    webxml_mime_mapping: [{
                        extension: 'woff',
                        mime_type: 'application/font-woff'
                    }]
                },
                files: [{
                    expand: true,
                    cwd: "dist/",
                    src: ["**"],
                    dest: "app/"
                }]
            }
        },

        yuidoc: {
            compile: {
                name: packageJSON.shortDescription,
                description: packageJSON.description,
                version: packageJSON.version,
                url: packageJSON.repository.url,
                logo: '../client/assets/images/Neon_60x34.png',
                options: {
                    paths: ["client/app", "client/components"],
                    outdir: "docs"
                }
            }
        },

        watch: {
            less: {
                files: ['client/app/*.less', 'client/{app,components}/**/*.less'],
                tasks: ['compile-less'],
                options: {
                    spawn: false
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-angular-templates');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-yuidoc');
    grunt.loadNpmTasks('grunt-eol');
    grunt.loadNpmTasks('grunt-exec');
    grunt.loadNpmTasks('grunt-git-describe');
    grunt.loadNpmTasks('grunt-injector');
    grunt.loadNpmTasks('grunt-jscs');
    grunt.loadNpmTasks('grunt-karma');
    grunt.loadNpmTasks('grunt-spritesmith');
    grunt.loadNpmTasks('grunt-usemin');
    grunt.loadNpmTasks('grunt-war');
    grunt.loadNpmTasks('grunt-wiredep');

    grunt.registerTask("bower_install", ["clean:lib", "exec:bower_install", "wiredep"]);
    grunt.registerTask('compile-less', ['clean:less', 'injector:less', 'less:themeLightGreen', 'less:themeDarkGreen', 'less:themeDarkPurple', 'sprite']);
    grunt.registerTask('saveRevision', function() {
        grunt.event.once('git-describe', function(rev) {
            var date = new Date(Date.now()).toISOString();
            date = date.replace(/-/g, '.').replace(/T.*/, '');

            var versionObj = {
                name: packageJSON.name,
                version: packageJSON.version + '-' + rev[2] + '-g' + rev[3] + '-' + date
            };
            grunt.file.write(versionJSONFile, JSON.stringify(versionObj));
        });
        grunt.task.run('git-describe');
    });
    grunt.registerTask('test', ['jshint:console', 'jscs:console', 'karma']);

    var defaultTasks = [
        'saveRevision',
        'wiredep',
        'injector',
        'less:themeLightGreen',
        'less:themeDarkGreen',
        'less:themeDarkPurple',
        'sprite',
        'useminPrepare',
        'ngtemplates',
        'concat',
        'uglify',
        'cssmin',
        'copy',
        'jshint:xml',
        'jscs:xml',
        'yuidoc',
        'eol',
        'usemin',
        'war'
    ];

    grunt.registerTask('no-bower', ['clean:docs', 'clean:war', 'clean:tests', 'clean:dist'].concat(defaultTasks));
    grunt.registerTask('build', ['clean', 'exec:bower_install'].concat(defaultTasks));
    grunt.registerTask('default', ['clean', 'exec:bower_install', 'test'].concat(defaultTasks));
};
