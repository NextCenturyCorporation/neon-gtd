'use strict';

module.exports = function(grunt) {
    var packageJSON = require('./package.json');
    var versionJSONFile = 'app/config/version.json';

    grunt.initConfig({
        exec: {
            bower_install: {
                command: "bower install",
                stdout: false
            }
        },

        clean: {
            lib: ["app/lib"],
            docs: ["docs"],
            war: ["target"],
            tests: ["reports"],
            less: ["app/css/app.css"],
            build: [".tmp", "build"]
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
                src: "app/index.html",
                directory: "app/lib",
                ignorePath: "app/",
                // The following libraries are added manually because they are (currently) not configured to work with wiredep.
                exclude: [/threedubmedia/, /mergesort/, /opencpu/, /openlayers/, /heatmapjs/, /slickgrid/, /user-ale/, /rainbowvis.js/]
            }
        },

        injector: {
            js: {
                options: {
                    transform: function(filePath) {
                        filePath = filePath.replace("/app/", "");
                        return '<script src="' + filePath + '"></script>';
                    }
                },
                files: {
                    "app/index.html": [
                        "app/js/namespaces.js",
                        "app/js/neon-extensions/*.js",
                        "app/js/charts/*.js",
                        "app/js/coremap/*.js",
                        "app/js/mediators/*.js",
                        "app/js/tables/*.js",
                        "app/js/time/*.js",
                        "app/js/app.js",
                        "app/js/*Service.js",
                        "app/js/*Controller.js",
                        "app/js/directives/*.js"
                    ]
                }
            },

            less: {
                options: {
                    starttag: "/* injector:less */",
                    endtag: "/* endinjector */",
                    transform: function(filePath) {
                        filePath = filePath.replace("/app/css/", "");
                        return '@import "' + filePath + '";';
                    }
                },
                files: {
                    "app/css/app.less": [
                        "app/css/*.less",
                        "app/css/directives/*.less",
                        "!app/css/app.less",
                        "!app/css/variables.less",
                        "!app/css/widgetStyle.less"
                    ]
                }
            }
        },

        less: {
            options: {
                dumpLineNumbers: 'comments',
                paths: ['app/components']
            },
            app: {
                files: {
                    'app/css/app.css': 'app/css/app.less'
                }
            }
        },

        // Packages all the images into a spritesheet and creates a CSS file for using the sprites.
        sprite: {
            app: {
                src: ["app/img/*.png", "app/img/visualizations/*.png", "!app/img/neon-dashboard-spritesheet.png"],
                dest: "app/img/neon-dashboard-spritesheet.png",
                destCss: "app/css/neon-dashboard-sprites.css"
            }
        },

        // Prepares concatenation and minification of CSS and JS dependencies in our index.html file.
        // Automatically configures files for the concat, uglify, and cssmin tasks using the <!-- build --> blocks in our index.html.
        useminPrepare: {
            html: "app/index.html",
            options: {
                dest: "build"
            }
        },

        // Copies concatenated, minified files into the build directory and inject dependencies into our index.html file.
        usemin: {
            html: ["build/{,*/}*.html"],
            options: {
                assetsDirs: ["build"]
            }
        },

        // Packages all the HTML partials into a JS file.
        ngtemplates: {
            options: {
                module: "neonDemo",
                // Add the template JS file to the list of JS files that the usemin task configured to concatenate.
                usemin: "build/js/neon-dashboard.min.js"
                // TODO Use the htmlmin option when the html-minifier task fully supports angular (currently the task just hangs when run).
            },
            app: {
                cwd: "app/",
                src: ["partials/**/*.html"],
                dest: "build/js/neon-dashboard-templates.js"
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
                cwd: "app/lib/bootstrap/dist/",
                src: ["fonts/**"],
                dest: "build/"
            },
            jquery_ui_lightness: {
                expand: true,
                cwd: "app/lib/jquery-ui/themes/ui-lightness",
                src: ["images/**"],
                dest: "build/css/"
            },
            jquery_ui_smoothness: {
                expand: true,
                cwd: "app/lib/jquery-ui/themes/smoothness",
                src: ["images/**"],
                dest: "build/css/"
            },
            openlayers: {
                expand: true,
                cwd: "app/",
                src: ["lib/openlayers/OpenLayers.js", "lib/openlayers/theme/default/style.css"],
                dest: "build/"
            },
            slickgrid: {
                expand: true,
                cwd: "app/lib/slickgrid/",
                src: ["images/**"],
                dest: "build/css/"
            },
            userale: {
                expand: true,
                cwd: "app/",
                src: ["lib/user-ale/helper-libs/javascript/userale-worker.js"],
                dest: "build/"
            },
            app: {
                expand: true,
                cwd: "app/",
                src: ["index.html", "config/**", "fonts/**", "help/**", "img/Neon_16x16.png", "img/neon-dashboard-spritesheet.png"],
                dest: "build/"
            }
        },

        jshint: {
            options: {
                jshintrc: '.jshintrc',
                force: true
            },
            console: [
                'Gruntfile.js',
                'app/js/*.js',
                'app/js/**/*.js',
                'test/**/*.js',
                '!app/js/vendor/**/*.js'
            ],
            xml: {
                options: {
                    reporter: "jslint",
                    reporterOutput: "reports/jslint.xml"
                },
                files: {
                    src: [
                        'Gruntfile.js',
                        'app/js/*.js',
                        'app/js/**/*.js',
                        'test/**/*.js',
                        '!app/js/vendor/**/*.js'
                    ]
                }
            }
        },

        jscs: {
            options: {
                config: ".jscsrc",
                excludeFiles: ["app/js/vendor/**/*.js"],
                force: true
            },
            console: {
                options: {
                    reporter: 'console'
                },
                files: {
                    src: ['Gruntfile.js', 'app/js/**/*.js', 'test/**/*.js']
                }
            },
            xml: {
                options: {
                    reporterOutput: 'reports/jscs.xml',
                    reporter: 'checkstyle'
                },
                files: {
                    src: ['Gruntfile.js', 'app/js/**/*.js', 'test/**/*.js']
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
                    cwd: ".",
                    src: ["app/**", "!**/*.less"],
                    dest: ""
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
                    cwd: ".",
                    src: ["build/**"],
                    dest: ""
                }]
            }
        },

        yuidoc: {
            compile: {
                name: packageJSON.shortDescription,
                description: packageJSON.description,
                version: packageJSON.version,
                url: packageJSON.repository.url,
                logo: '../app/img/Neon_60x34.png',
                options: {
                    paths: 'app/js',
                    exclude: "vendor",
                    outdir: 'docs'
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
    grunt.loadNpmTasks('grunt-contrib-yuidoc');
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
    grunt.registerTask('compile-less', ['clean:less', 'injector:less', 'less', 'sprite']);
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
        'less',
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
        'usemin',
        'war'
    ];

    grunt.registerTask('no-bower', ['clean:docs', 'clean:war', 'clean:tests', 'clean:build'].concat(defaultTasks));
    grunt.registerTask('default', ['clean', 'exec:bower_install'].concat(defaultTasks));
};
